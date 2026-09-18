-- M17 partial integration coverage for tenant/RBAC-scoped model CRUD.
-- Synthetic auth/users only; CI wraps this file in a transaction and rolls back.

do $seed$
declare
  u_owner uuid := '91919191-9191-4191-8191-919191919191';
  u_editor uuid := '92929292-9292-4292-8292-929292929292';
  u_viewer uuid := '93939393-9393-4393-8393-939393939393';
  u_other uuid := '94949494-9494-4494-8494-949494949494';
  org_a uuid := '95959595-9595-4595-8595-959595959595';
  org_b uuid := '96969696-9696-4696-8696-969696969696';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_editor,u_viewer,u_other
    );
  else
    insert into auth.users(id) values (u_owner),(u_editor),(u_viewer),(u_other);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'M17 Org A','m17-org-a'),
    (org_b,'M17 Org B','m17-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_editor,'editor'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');
end
$seed$;

do $m17$
declare
  org_a uuid := '95959595-9595-4595-8595-959595959595';
  org_b uuid := '96969696-9696-4696-8696-969696969696';
  a_id uuid;
  b_id uuid;
  payload jsonb;
  seen boolean;
begin
  -- Owner creates in org A.
  perform set_config('request.jwt.claim.sub','91919191-9191-4191-8191-919191919191',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_models_create('MODEL-A','Maker A','electric_vehicle','{"capacityKwh":82}'::jsonb);
  a_id:=(payload->>'id')::uuid;
  if payload->>'model_identifier'<>'MODEL-A' then
    raise exception 'M17 create returned wrong model';
  end if;

  -- Editor may update/create, and list only active tenant.
  perform set_config('request.jwt.claim.sub','92929292-9292-4292-8292-929292929292',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_models_update(a_id,'MODEL-A2',null,null,'{"capacityKwh":84}'::jsonb);
  if payload->>'model_identifier'<>'MODEL-A2' or payload#>>'{canonical_data,capacityKwh}'<>'84' then
    raise exception 'M17 editor update failed';
  end if;
  payload:=public.dpp_api_models_create('MODEL-A3','Maker A','industrial','{}'::jsonb);
  if jsonb_array_length(public.dpp_api_models_list())<>2 then
    raise exception 'M17 org A list count mismatch';
  end if;

  -- Other tenant creates its own record.
  perform set_config('request.jwt.claim.sub','94949494-9494-4494-8494-949494949494',true);
  perform public.dpp_set_active_organization(org_b);
  payload:=public.dpp_api_models_create('MODEL-B','Maker B','portable','{}'::jsonb);
  b_id:=(payload->>'id')::uuid;
  if jsonb_array_length(public.dpp_api_models_list())<>1 then
    raise exception 'M17 org B list count mismatch';
  end if;

  -- Cross-tenant update is non-enumerating not-found.
  seen:=false;
  begin
    perform public.dpp_api_models_update(a_id,'ILLEGAL',null,null,null);
  exception when sqlstate 'DP205' then
    seen:=true;
  end;
  if not seen then raise exception 'M17 cross-tenant update was not denied'; end if;

  -- Viewer can read but cannot mutate.
  perform set_config('request.jwt.claim.sub','93939393-9393-4393-8393-939393939393',true);
  perform public.dpp_set_active_organization(org_a);
  if jsonb_array_length(public.dpp_api_models_list())<>2 then
    raise exception 'M17 viewer read failed';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_models_create('VIEWER-WRITE','Maker','portable','{}'::jsonb);
  exception when sqlstate 'DP104' then
    seen:=true;
  end;
  if not seen then raise exception 'M17 viewer create was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_models_update(a_id,'VIEWER-WRITE',null,null,null);
  exception when sqlstate 'DP104' then
    seen:=true;
  end;
  if not seen then raise exception 'M17 viewer update was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_models_delete(a_id);
  exception when sqlstate 'DP104' then
    seen:=true;
  end;
  if not seen then raise exception 'M17 viewer delete was not denied'; end if;

  -- Owner may delete in own tenant.
  perform set_config('request.jwt.claim.sub','91919191-9191-4191-8191-919191919191',true);
  perform public.dpp_set_active_organization(org_a);
  if public.dpp_api_models_delete(a_id)<>a_id then
    raise exception 'M17 owner delete failed';
  end if;

  -- Cross-tenant delete is non-enumerating not-found.
  seen:=false;
  begin
    perform public.dpp_api_models_delete(b_id);
  exception when sqlstate 'DP205' then
    seen:=true;
  end;
  if not seen then raise exception 'M17 cross-tenant delete was not denied'; end if;

  -- Input validation has stable SQLSTATEs.
  seen:=false;
  begin
    perform public.dpp_api_models_create('','Maker','portable','{}'::jsonb);
  exception when sqlstate 'DP201' then seen:=true;
  end;
  if not seen then raise exception 'M17 empty model identifier was not rejected'; end if;

  seen:=false;
  begin
    perform public.dpp_api_models_create('X','','portable','{}'::jsonb);
  exception when sqlstate 'DP202' then seen:=true;
  end;
  if not seen then raise exception 'M17 empty manufacturer was not rejected'; end if;

  seen:=false;
  begin
    perform public.dpp_api_models_create('X','Maker','invalid','{}'::jsonb);
  exception when sqlstate 'DP203' then seen:=true;
  end;
  if not seen then raise exception 'M17 invalid category was not rejected'; end if;

  seen:=false;
  begin
    perform public.dpp_api_models_create('X','Maker','portable','[]'::jsonb);
  exception when sqlstate 'DP204' then seen:=true;
  end;
  if not seen then raise exception 'M17 non-object canonical_data was not rejected'; end if;
end
$m17$;

select 'M17_MODELS_RPC_SUBSET_PASS' as result;
