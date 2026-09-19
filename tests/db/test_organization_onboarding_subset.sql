-- M02/M03/M24 organization onboarding and membership-management precursor.
-- Caller wraps in BEGIN/ROLLBACK.

do $test$
declare
  u_owner uuid := 'c1818181-8181-4181-8181-818181818181';
  u_admin uuid := 'c2828282-8282-4282-8282-828282828282';
  u_editor uuid := 'c3838383-8383-4383-8383-838383838383';
  u_viewer uuid := 'c4848484-8484-4484-8484-848484848484';
  u_extra uuid := 'c5858585-8585-4585-8585-858585858585';
  u_outsider uuid := 'c6868686-8686-4686-8686-868686868686';
  org_a uuid;
  org_b uuid;
  payload jsonb;
  members jsonb;
  seen boolean;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_admin,u_editor,u_viewer,u_extra,u_outsider
    );
  else
    insert into auth.users(id) values (u_owner),(u_admin),(u_editor),(u_viewer),(u_extra),(u_outsider);
  end if;

  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  payload:=public.dpp_api_organization_create('Pilot Org A','pilot-org-a');
  org_a:=(payload->>'organization_id')::uuid;

  if payload->>'role'<>'owner' or (payload->>'active')::boolean is not true then
    raise exception 'M24 organization creation did not return owner/active state';
  end if;
  if public.dpp_active_organization_id()<>org_a then
    raise exception 'M02 organization create did not set active tenant';
  end if;
  if not exists(
    select 1 from public.dpp_organization_members
    where organization_id=org_a and user_id=u_owner and role='owner'
  ) then
    raise exception 'M03 organization creator was not persisted as owner';
  end if;

  perform public.dpp_api_members_add(u_admin,'admin');
  perform public.dpp_api_members_add(u_editor,'editor');
  perform public.dpp_api_members_add(u_viewer,'viewer');

  seen:=false;
  begin
    perform public.dpp_api_members_add(u_extra,'owner');
  exception when sqlstate 'DP501' then seen:=true;
  end;
  if not seen then raise exception 'M03 generic member add allowed owner role'; end if;

  seen:=false;
  begin
    perform public.dpp_api_members_add(u_extra,null);
  exception when sqlstate 'DP501' then seen:=true;
  end;
  if not seen then raise exception 'M03 generic member add did not reject null role'; end if;

  members:=public.dpp_api_members_list();
  if jsonb_array_length(members)<>4 then
    raise exception 'M03 owner member list expected 4 rows, got %',jsonb_array_length(members);
  end if;

  perform set_config('request.jwt.claim.sub',u_admin::text,true);
  perform public.dpp_api_tenant_context_set(org_a);

  perform public.dpp_api_members_add(u_extra,'viewer');
  perform public.dpp_api_members_update(u_extra,'editor');

  seen:=false;
  begin
    perform public.dpp_api_members_update(u_extra,null);
  exception when sqlstate 'DP501' then seen:=true;
  end;
  if not seen then raise exception 'M03 member update did not reject null role'; end if;

  seen:=false;
  begin
    perform public.dpp_api_members_update(u_owner,'viewer');
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M03 admin could modify owner role'; end if;

  seen:=false;
  begin
    perform public.dpp_api_members_update(u_editor,'admin');
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M03 admin could promote editor to admin'; end if;

  seen:=false;
  begin
    perform public.dpp_api_members_delete(u_owner);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M03 admin could delete owner'; end if;

  perform public.dpp_api_members_delete(u_extra);

  perform set_config('request.jwt.claim.sub',u_viewer::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  seen:=false;
  begin
    perform public.dpp_api_members_add(u_extra,'viewer');
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M03 viewer could manage members'; end if;

  perform set_config('request.jwt.claim.sub',u_outsider::text,true);
  payload:=public.dpp_api_organization_create('Pilot Org B','pilot-org-b');
  org_b:=(payload->>'organization_id')::uuid;
  members:=public.dpp_api_members_list();
  if jsonb_array_length(members)<>1 or members->0->>'user_id'<>u_outsider::text then
    raise exception 'M02 member list leaked cross-tenant membership';
  end if;

  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_members_update(u_admin,'editor');
  perform public.dpp_api_members_delete(u_admin);

  seen:=false;
  begin
    perform public.dpp_api_members_delete(u_owner);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M03 owner could remove own owner role through generic API'; end if;

  if not exists(
    select 1 from public.dpp_audit_log
    where organization_id=org_a and target_table='dpp_organizations' and action='INSERT'
  ) then raise exception 'M12 onboarding organization audit missing'; end if;
  if not exists(
    select 1 from public.dpp_audit_log
    where organization_id=org_a and target_table='dpp_organization_members' and action='INSERT'
  ) then raise exception 'M12 onboarding membership audit missing'; end if;
  if not exists(
    select 1 from public.dpp_audit_log
    where organization_id=org_a and target_table='dpp_user_tenant_context'
  ) then raise exception 'M12 onboarding tenant-context audit missing'; end if;
end
$test$;

select 'M02_M03_M24_ORGANIZATION_ONBOARDING_PASS' as result;
