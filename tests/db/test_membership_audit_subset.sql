-- M12 precursor: production membership mutations must produce complete immutable audit history.
-- Caller wraps in BEGIN/ROLLBACK.

do $test$
declare
  u_owner uuid := 'f1818181-8181-4181-8181-818181818181';
  u_member uuid := 'f2828282-8282-4282-8282-828282828282';
  org_id uuid := 'f3838383-8383-4383-8383-838383838383';
  v_count integer;
  v_insert_id bigint;
  v_update_id bigint;
  v_delete_id bigint;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_member
    );
  else
    insert into auth.users(id) values (u_owner),(u_member);
  end if;

  insert into public.dpp_organizations(id,name,slug)
  values(org_id,'M12 Membership Audit Org','m12-membership-audit-org');

  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(org_id,u_owner,'owner');

  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  perform public.dpp_api_tenant_context_set(org_id);

  perform public.dpp_api_members_add(u_member,'viewer');
  perform public.dpp_api_members_update(u_member,'editor');
  perform public.dpp_api_members_delete(u_member);

  select count(*)
    into v_count
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and target_table='dpp_organization_members'
    and target_id=u_member
    and action in ('INSERT','UPDATE','DELETE')
    and occurred_at is not null;

  if v_count<>3 then
    raise exception 'M12 membership audit expected 3 rows, got %',v_count;
  end if;

  select id into v_insert_id
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and target_table='dpp_organization_members'
    and target_id=u_member
    and action='INSERT'
    and before_data is null
    and after_data->>'role'='viewer'
  order by id desc
  limit 1;

  if v_insert_id is null then
    raise exception 'M12 membership INSERT audit snapshot missing';
  end if;

  select id into v_update_id
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and target_table='dpp_organization_members'
    and target_id=u_member
    and action='UPDATE'
    and before_data->>'role'='viewer'
    and after_data->>'role'='editor'
  order by id desc
  limit 1;

  if v_update_id is null then
    raise exception 'M12 membership UPDATE before/after role snapshot missing';
  end if;

  select id into v_delete_id
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and target_table='dpp_organization_members'
    and target_id=u_member
    and action='DELETE'
    and before_data->>'role'='editor'
    and after_data is null
  order by id desc
  limit 1;

  if v_delete_id is null then
    raise exception 'M12 membership DELETE audit snapshot missing';
  end if;
end
$test$;

select 'M12_MEMBERSHIP_AUDIT_PASS' as result;
