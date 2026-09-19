-- M05/M03 precursor: membership revocation must invalidate stale active-tenant context and API access.
-- Caller wraps in BEGIN/ROLLBACK.

do $test$
declare
  u_owner uuid := 'e1818181-8181-4181-8181-818181818181';
  u_viewer uuid := 'e2828282-8282-4282-8282-828282828282';
  org_id uuid := 'e3838383-8383-4383-8383-838383838383';
  model_id uuid := 'e4848484-8484-4484-8484-848484848484';
  v_seen boolean;
  orgs jsonb;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_viewer
    );
  else
    insert into auth.users(id) values (u_owner),(u_viewer);
  end if;

  insert into public.dpp_organizations(id,name,slug)
  values(org_id,'M05 Revocation Org','m05-revocation-org');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_id,u_owner,'owner'),
    (org_id,u_viewer,'viewer');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(
    model_id,org_id,'M05-REVOKE','Revocation Test','electric_vehicle','{}'::jsonb
  );

  -- Viewer establishes a valid active tenant and can read it.
  perform set_config('request.jwt.claim.sub',u_viewer::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  if public.dpp_active_organization_id()<>org_id then
    raise exception 'M05 viewer active tenant was not established';
  end if;
  if jsonb_array_length(public.dpp_api_models_list())<>1 then
    raise exception 'M05 viewer could not read own-tenant model before revocation';
  end if;

  -- Owner revokes viewer membership through the production RPC.
  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  perform public.dpp_api_members_delete(u_viewer);

  if exists(
    select 1 from public.dpp_user_tenant_context
    where user_id=u_viewer
  ) then
    raise exception 'M05 revoked membership left stale active tenant context';
  end if;

  -- Revoked user must fail closed: no active tenant, no data API access, no memberships.
  perform set_config('request.jwt.claim.sub',u_viewer::text,true);

  v_seen:=false;
  begin
    perform public.dpp_api_models_list();
  exception when sqlstate 'DP103' then
    v_seen:=true;
  end;
  if not v_seen then
    raise exception 'M05 revoked viewer retained models API access';
  end if;

  v_seen:=false;
  begin
    perform public.dpp_api_authorization_context();
  exception when sqlstate 'DP103' then
    v_seen:=true;
  end;
  if not v_seen then
    raise exception 'M03 revoked viewer retained authorization context';
  end if;

  orgs:=public.dpp_api_organizations_list();
  if jsonb_array_length(orgs)<>0 then
    raise exception 'M02 revoked viewer still discovered organization membership: %',orgs;
  end if;
end
$test$;

select 'M05_MEMBERSHIP_REVOCATION_ISOLATION_PASS' as result;
