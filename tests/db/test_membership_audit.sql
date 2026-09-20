-- M12/M03 precursor: membership authorization changes must be immutable and attributable.
-- Caller wraps in BEGIN/ROLLBACK.

do $test$
declare
  u_owner uuid := 'f1818181-8181-4181-8181-818181818181';
  u_member uuid := 'f2828282-8282-4282-8282-828282828282';
  org_id uuid := 'f3838383-8383-4383-8383-838383838383';
  v_add bigint;
  v_update bigint;
  v_delete bigint;
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

  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  perform public.dpp_api_organization_create('M12 Membership Audit','m12-membership-audit');

  select id into org_id
  from public.dpp_organizations
  where slug='m12-membership-audit';

  perform public.dpp_api_members_add(u_member,'viewer');
  perform public.dpp_api_members_update(u_member,'editor');
  perform public.dpp_api_members_delete(u_member);

  select id into v_add
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and target_table='dpp_organization_members'
    and action='INSERT'
    and after_data->>'user_id'=u_member::text
    and after_data->>'role'='viewer'
  order by id desc limit 1;

  if v_add is null then
    raise exception 'M12 membership add audit missing actor/org/after role';
  end if;

  select id into v_update
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and target_table='dpp_organization_members'
    and action='UPDATE'
    and before_data->>'user_id'=u_member::text
    and before_data->>'role'='viewer'
    and after_data->>'role'='editor'
  order by id desc limit 1;

  if v_update is null then
    raise exception 'M12 membership role-change audit missing before/after';
  end if;

  select id into v_delete
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and target_table='dpp_organization_members'
    and action='DELETE'
    and before_data->>'user_id'=u_member::text
    and before_data->>'role'='editor'
    and after_data is null
  order by id desc limit 1;

  if v_delete is null then
    raise exception 'M12 membership delete audit missing before snapshot';
  end if;

  if exists(
    select 1 from public.dpp_audit_log
    where id in (v_add,v_update,v_delete)
      and occurred_at is null
  ) then
    raise exception 'M12 membership audit row missing occurred_at';
  end if;
end
$test$;

select 'M12_MEMBERSHIP_AUDIT_PASS' as result;
