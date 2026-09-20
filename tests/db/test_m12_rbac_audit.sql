-- M12/M03 precursor: RBAC membership mutations must produce immutable actor-attributed audit records.
-- Caller wraps in BEGIN/ROLLBACK.

do $test$
declare
  u_owner uuid := 'f1818181-8181-4181-8181-818181818181';
  u_admin uuid := 'f2828282-8282-4282-8282-828282828282';
  u_viewer uuid := 'f3838383-8383-4383-8383-838383838383';
  org_id uuid := 'f4848484-8484-4484-8484-848484848484';
  update_id bigint;
  delete_id bigint;
  before_role text;
  after_role text;
  delete_before_role text;
  seen boolean;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_admin,u_viewer
    );
  else
    insert into auth.users(id) values (u_owner),(u_admin),(u_viewer);
  end if;

  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  perform public.dpp_api_organization_create('M12 RBAC Audit Org','m12-rbac-audit-org');
  select id into org_id
  from public.dpp_organizations
  where slug='m12-rbac-audit-org';

  perform public.dpp_api_members_add(u_admin,'admin');
  perform public.dpp_api_members_add(u_viewer,'viewer');

  perform public.dpp_api_members_update(u_viewer,'editor');

  select id,before_data->>'role',after_data->>'role'
  into update_id,before_role,after_role
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and action='UPDATE'
    and target_table='dpp_organization_members'
    and target_id=u_viewer
  order by id desc
  limit 1;

  if update_id is null then
    raise exception 'M12 membership role-change audit row missing';
  end if;
  if before_role<>'viewer' or after_role<>'editor' then
    raise exception 'M12 membership role audit before/after mismatch: % -> %',before_role,after_role;
  end if;

  perform public.dpp_api_members_delete(u_viewer);

  select id,before_data->>'role'
  into delete_id,delete_before_role
  from public.dpp_audit_log
  where organization_id=org_id
    and actor_id=u_owner
    and action='DELETE'
    and target_table='dpp_organization_members'
    and target_id=u_viewer
  order by id desc
  limit 1;

  if delete_id is null or delete_before_role<>'editor' then
    raise exception 'M12 membership deletion audit row missing or wrong before role';
  end if;

  seen:=false;
  begin
    update public.dpp_audit_log
    set actor_id=u_admin
    where id=update_id;
  exception when sqlstate '55000' then
    seen:=true;
  end;
  if not seen then
    raise exception 'M12 RBAC audit actor was mutable';
  end if;

  seen:=false;
  begin
    delete from public.dpp_audit_log
    where id=delete_id;
  exception when sqlstate '55000' then
    seen:=true;
  end;
  if not seen then
    raise exception 'M12 RBAC audit deletion was mutable';
  end if;
end
$test$;

select 'M12_RBAC_AUDIT_PASS' as result;
