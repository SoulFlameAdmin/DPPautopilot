-- M12 active tenant audit regression.
-- Caller must wrap this file in a rollback transaction.

do $m12_tenant_audit$
declare
  u_actor uuid := 'c1818181-8181-4181-8181-818181818181';
  org_a uuid := 'c2828282-8282-4282-8282-828282828282';
  org_b uuid := 'c3838383-8383-4383-8383-838383838383';
  v_count integer;
  v_before uuid;
  v_after uuid;
  v_audit_id bigint;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false)',
      u_actor
    );
  else
    insert into auth.users(id) values (u_actor);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'M12 Tenant Audit A','m12-tenant-audit-a'),
    (org_b,'M12 Tenant Audit B','m12-tenant-audit-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_actor,'owner'),
    (org_b,u_actor,'admin');

  perform set_config('request.jwt.claim.sub',u_actor::text,true);

  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_tenant_context_set(org_b);

  select count(*) into v_count
  from public.dpp_audit_log
  where actor_id=u_actor
    and target_table='dpp_user_tenant_context'
    and target_id=u_actor
    and action in ('INSERT','UPDATE');

  if v_count<>2 then
    raise exception 'M12 tenant context expected 2 audit rows, got %',v_count;
  end if;

  select id,
         nullif(before_data->>'active_organization_id','')::uuid,
         nullif(after_data->>'active_organization_id','')::uuid
    into v_audit_id,v_before,v_after
  from public.dpp_audit_log
  where actor_id=u_actor
    and target_table='dpp_user_tenant_context'
    and target_id=u_actor
    and action='UPDATE'
  order by id desc
  limit 1;

  if v_audit_id is null then
    raise exception 'M12 tenant switch UPDATE audit row missing';
  end if;
  if v_before<>org_a or v_after<>org_b then
    raise exception 'M12 tenant switch before/after mismatch before=% after=%',v_before,v_after;
  end if;

  if not exists(
    select 1 from public.dpp_audit_log
    where id=v_audit_id
      and organization_id=org_b
      and actor_id=u_actor
      and occurred_at is not null
  ) then
    raise exception 'M12 tenant switch actor/org/time metadata incomplete';
  end if;
end
$m12_tenant_audit$;

select 'M12_TENANT_CONTEXT_AUDIT_PASS' as result;
