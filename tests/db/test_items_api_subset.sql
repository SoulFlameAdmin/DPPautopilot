-- M18 partial integration coverage for tenant/RBAC-scoped battery-item CRUD.
-- Synthetic auth/users only; CI wraps this file in a transaction and rolls back.

do $seed$
declare
  u_owner uuid := 'a1111111-1111-4111-8111-111111111111';
  u_editor uuid := 'a2222222-2222-4222-8222-222222222222';
  u_viewer uuid := 'a3333333-3333-4333-8333-333333333333';
  u_other uuid := 'a4444444-4444-4444-8444-444444444444';
  org_a uuid := 'a5555555-5555-4555-8555-555555555555';
  org_b uuid := 'a6666666-6666-4666-8666-666666666666';
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
    (org_a,'M18 Org A','m18-org-a'),
    (org_b,'M18 Org B','m18-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_editor,'editor'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values
    ('a7777777-7777-4777-8777-777777777777',org_a,'M18-MODEL-A','Maker A','electric_vehicle','{}'::jsonb),
    ('a8888888-8888-4888-8888-888888888888',org_b,'M18-MODEL-B','Maker B','industrial','{}'::jsonb);
end
$seed$;

do $m18$
declare
  org_a uuid := 'a5555555-5555-4555-8555-555555555555';
  org_b uuid := 'a6666666-6666-4666-8666-666666666666';
  model_a uuid := 'a7777777-7777-4777-8777-777777777777';
  model_b uuid := 'a8888888-8888-4888-8888-888888888888';
  item_a uuid;
  item_delete uuid;
  item_b uuid;
  payload jsonb;
  seen boolean;
begin
  -- Owner creates in own tenant and cannot link to another tenant's model.
  perform set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_items_create(model_a,'urn:dpp:m18:a:1','original','{"serial":"A-1"}'::jsonb);
  item_a:=(payload->>'id')::uuid;
  if payload->>'unique_identifier'<>'urn:dpp:m18:a:1' then
    raise exception 'M18 create returned wrong identifier';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_items_create(model_b,'urn:dpp:m18:illegal','original','{}'::jsonb);
  exception when sqlstate 'DP305' then seen:=true;
  end;
  if not seen then raise exception 'M18 cross-tenant model linkage was not rejected'; end if;

  -- Editor can create/update and a valid lifecycle transition is enforced.
  perform set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_items_update(item_a,null,'urn:dpp:m18:a:1-updated','second_life','{"serial":"A-1","state":"updated"}'::jsonb);
  if payload->>'lifecycle_status'<>'second_life' or payload->>'unique_identifier'<>'urn:dpp:m18:a:1-updated' then
    raise exception 'M18 editor update/lifecycle transition failed';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_items_update(item_a,null,null,'original',null);
  exception when sqlstate 'DP307' then seen:=true;
  end;
  if not seen then raise exception 'M18 invalid backward lifecycle transition was not rejected'; end if;

  payload:=public.dpp_api_items_create(model_a,'urn:dpp:m18:a:delete','original','{}'::jsonb);
  item_delete:=(payload->>'id')::uuid;

  -- Other tenant sees only its own records and cannot mutate guessed org-A ids.
  perform set_config('request.jwt.claim.sub','a4444444-4444-4444-8444-444444444444',true);
  perform public.dpp_set_active_organization(org_b);
  payload:=public.dpp_api_items_create(model_b,'urn:dpp:m18:b:1','original','{}'::jsonb);
  item_b:=(payload->>'id')::uuid;
  if jsonb_array_length(public.dpp_api_items_list())<>1 then
    raise exception 'M18 org B list count mismatch';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_items_update(item_a,null,'ILLEGAL',null,null);
  exception when sqlstate 'DP306' then seen:=true;
  end;
  if not seen then raise exception 'M18 cross-tenant update was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_items_delete(item_a);
  exception when sqlstate 'DP306' then seen:=true;
  end;
  if not seen then raise exception 'M18 cross-tenant delete was not denied'; end if;

  -- Viewer can list own tenant but cannot create/update/delete.
  perform set_config('request.jwt.claim.sub','a3333333-3333-4333-8333-333333333333',true);
  perform public.dpp_set_active_organization(org_a);
  if jsonb_array_length(public.dpp_api_items_list())<>2 then
    raise exception 'M18 viewer list count mismatch';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_items_create(model_a,'urn:dpp:m18:viewer','original','{}'::jsonb);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M18 viewer create was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_items_update(item_a,null,null,null,'{"x":1}'::jsonb);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M18 viewer update was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_items_delete(item_delete);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M18 viewer delete was not denied'; end if;

  -- Owner cannot delete an item once a passport exists; un-passported item may be deleted.
  perform set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  insert into public.dpp_passports(
    organization_id,battery_item_id,status,public_payload,private_payload,created_by
  ) values (
    org_a,item_a,'draft','{}'::jsonb,'{}'::jsonb,'a1111111-1111-4111-8111-111111111111'
  );

  seen:=false;
  begin
    perform public.dpp_api_items_delete(item_a);
  exception when sqlstate 'DP308' then seen:=true;
  end;
  if not seen then raise exception 'M18 passport-protected item delete was not rejected'; end if;

  if public.dpp_api_items_delete(item_delete)<>item_delete then
    raise exception 'M18 owner delete of un-passported item failed';
  end if;

  -- Stable validation errors.
  seen:=false;
  begin
    perform public.dpp_api_items_create(model_a,'','original','{}'::jsonb);
  exception when sqlstate 'DP301' then seen:=true;
  end;
  if not seen then raise exception 'M18 empty identifier was not rejected'; end if;

  seen:=false;
  begin
    perform public.dpp_api_items_create(model_a,'urn:dpp:m18:bad','invalid','{}'::jsonb);
  exception when sqlstate 'DP302' then seen:=true;
  end;
  if not seen then raise exception 'M18 invalid lifecycle was not rejected'; end if;

  seen:=false;
  begin
    perform public.dpp_api_items_create(model_a,'urn:dpp:m18:badjson','original','[]'::jsonb);
  exception when sqlstate 'DP303' then seen:=true;
  end;
  if not seen then raise exception 'M18 non-object canonical_data was not rejected'; end if;

  -- Silence unused-variable warnings by proving org-B id is real.
  if item_b is null then raise exception 'M18 org B item id missing'; end if;
end
$m18$;

select 'M18_ITEMS_RPC_SUBSET_PASS' as result;
