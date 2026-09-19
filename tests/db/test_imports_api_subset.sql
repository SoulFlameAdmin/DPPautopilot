-- M20 API facade tenant/RBAC/integration coverage.
-- CI wraps this file in a transaction and rolls it back.

do $seed$
declare
  u_owner uuid := 'd1111111-1111-4111-8111-111111111111';
  u_editor uuid := 'd2222222-2222-4222-8222-222222222222';
  u_viewer uuid := 'd3333333-3333-4333-8333-333333333333';
  u_other uuid := 'd4444444-4444-4444-8444-444444444444';
  org_a uuid := 'd5555555-5555-4555-8555-555555555555';
  org_b uuid := 'd6666666-6666-4666-8666-666666666666';
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
    (org_a,'M20 API Org A','m20-api-org-a'),
    (org_b,'M20 API Org B','m20-api-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_editor,'editor'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');

  insert into public.dpp_import_mappings(
    id,organization_id,name,source_headers,field_mapping,created_by
  ) values
    ('d7777777-7777-4777-8777-777777777777',org_a,'M20 Mapping A','["model","serial"]'::jsonb,'{"model":"model_identifier","serial":"unique_identifier"}'::jsonb,u_owner),
    ('d8888888-8888-4888-8888-888888888888',org_b,'M20 Mapping B','["model","serial"]'::jsonb,'{"model":"model_identifier","serial":"unique_identifier"}'::jsonb,u_other);
end
$seed$;

do $m20api$
declare
  org_a uuid := 'd5555555-5555-4555-8555-555555555555';
  org_b uuid := 'd6666666-6666-4666-8666-666666666666';
  mapping_a uuid := 'd7777777-7777-4777-8777-777777777777';
  mapping_b uuid := 'd8888888-8888-4888-8888-888888888888';
  import_a uuid;
  editor_import uuid;
  payload jsonb;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','d1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  payload:=public.dpp_api_import_create(
    jsonb_build_array(
      jsonb_build_object(
        'normalized_model',jsonb_build_object(
          'model_identifier','M20-API-A',
          'manufacturer_name','M20 Maker',
          'category','electric_vehicle',
          'canonical_data',jsonb_build_object('capacity_kwh',60)
        ),
        'normalized_item',jsonb_build_object(
          'unique_identifier','urn:dpp:m20:api:a:1',
          'lifecycle_status','original',
          'canonical_data',jsonb_build_object('serial','A1')
        ),
        'validation_errors','[]'::jsonb
      ),
      jsonb_build_object(
        'normalized_model',jsonb_build_object(
          'model_identifier','M20-API-A',
          'manufacturer_name','M20 Maker',
          'category','electric_vehicle',
          'canonical_data',jsonb_build_object('capacity_kwh',60)
        ),
        'normalized_item',jsonb_build_object(
          'unique_identifier','urn:dpp:m20:api:a:2',
          'lifecycle_status','original',
          'canonical_data',jsonb_build_object('serial','A2')
        ),
        'validation_errors','[]'::jsonb
      )
    ),
    mapping_a
  );
  import_a:=(payload->>'import_id')::uuid;
  if payload->>'status'<>'staged' or (payload->>'staged_rows')::int<>2 then
    raise exception 'M20 API create payload mismatch: %',payload;
  end if;

  payload:=public.dpp_api_import_get(import_a);
  if payload->>'status'<>'staged' or payload->>'mapping_id'<>mapping_a::text then
    raise exception 'M20 API staged get mismatch: %',payload;
  end if;

  payload:=public.dpp_api_import_validate(import_a);
  if payload->>'status'<>'validated'
     or (payload->>'row_count')::int<>2
     or (payload->>'error_count')::int<>0 then
    raise exception 'M20 API validate mismatch: %',payload;
  end if;

  payload:=public.dpp_api_import_commit(import_a);
  if payload->>'status'<>'committed'
     or (payload->>'committed_rows')::int<>2
     or coalesce((payload->>'already_committed')::boolean,true) then
    raise exception 'M20 API first commit mismatch: %',payload;
  end if;

  payload:=public.dpp_api_import_commit(import_a);
  if payload->>'status'<>'committed'
     or (payload->>'committed_rows')::int<>2
     or coalesce((payload->>'already_committed')::boolean,false) is not true then
    raise exception 'M20 API repeated commit was not idempotent: %',payload;
  end if;

  if (select count(*) from public.dpp_battery_items where organization_id=org_a and unique_identifier like 'urn:dpp:m20:api:a:%')<>2 then
    raise exception 'M20 API committed item count mismatch';
  end if;

  -- Editor may stage imports in the same tenant.
  perform set_config('request.jwt.claim.sub','d2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_import_create(
    jsonb_build_array(
      jsonb_build_object(
        'normalized_model',jsonb_build_object(
          'model_identifier','M20-EDITOR',
          'manufacturer_name','Editor Maker',
          'category','portable'
        ),
        'normalized_item',jsonb_build_object(
          'unique_identifier','urn:dpp:m20:editor:1'
        ),
        'validation_errors','[]'::jsonb
      )
    ),
    null
  );
  editor_import:=(payload->>'import_id')::uuid;
  if editor_import is null then raise exception 'M20 editor import create failed'; end if;

  -- Viewer may read import status but not create/validate/commit.
  perform set_config('request.jwt.claim.sub','d3333333-3333-4333-8333-333333333333',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_import_get(import_a);
  if payload->>'status'<>'committed' then
    raise exception 'M20 viewer import get failed';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_import_create(
      jsonb_build_array(jsonb_build_object(
        'normalized_model',jsonb_build_object('model_identifier','NOPE','manufacturer_name','Nope','category','portable'),
        'normalized_item',jsonb_build_object('unique_identifier','urn:dpp:m20:nope')
      )),
      null
    );
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M20 viewer create was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_import_validate(editor_import);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M20 viewer validate was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_import_commit(editor_import);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M20 viewer commit was not denied'; end if;

  -- Cross-tenant guessed IDs are non-enumerating DP001.
  perform set_config('request.jwt.claim.sub','d4444444-4444-4444-8444-444444444444',true);
  perform public.dpp_set_active_organization(org_b);

  seen:=false;
  begin
    perform public.dpp_api_import_get(import_a);
  exception when sqlstate 'DP001' then seen:=true;
  end;
  if not seen then raise exception 'M20 cross-tenant get was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_import_validate(import_a);
  exception when sqlstate 'DP001' then seen:=true;
  end;
  if not seen then raise exception 'M20 cross-tenant validate was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_import_commit(import_a);
  exception when sqlstate 'DP001' then seen:=true;
  end;
  if not seen then raise exception 'M20 cross-tenant commit was not denied'; end if;

  -- Foreign mapping cannot be selected after returning to org A.
  perform set_config('request.jwt.claim.sub','d1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  seen:=false;
  begin
    perform public.dpp_api_import_create(
      jsonb_build_array(jsonb_build_object(
        'normalized_model',jsonb_build_object('model_identifier','M20-X','manufacturer_name','X','category','portable'),
        'normalized_item',jsonb_build_object('unique_identifier','urn:dpp:m20:x')
      )),
      mapping_b
    );
  exception when sqlstate 'DP010' then seen:=true;
  end;
  if not seen then raise exception 'M20 foreign mapping was not rejected'; end if;

  -- Malformed/empty create payloads fail with DP009.
  seen:=false;
  begin
    perform public.dpp_api_import_create('[]'::jsonb,null);
  exception when sqlstate 'DP009' then seen:=true;
  end;
  if not seen then raise exception 'M20 empty rows were not rejected'; end if;

  seen:=false;
  begin
    perform public.dpp_api_import_create(
      '[{"normalized_model":[],"normalized_item":{}}]'::jsonb,
      null
    );
  exception when sqlstate 'DP009' then seen:=true;
  end;
  if not seen then raise exception 'M20 malformed normalized_model was not rejected'; end if;

  -- Public/authenticated privilege surface stays narrow.
  if has_function_privilege('anon','public.dpp_api_import_create(jsonb,uuid)','EXECUTE')
     or has_function_privilege('anon','public.dpp_api_import_get(uuid)','EXECUTE')
     or has_function_privilege('anon','public.dpp_api_import_validate(uuid)','EXECUTE')
     or has_function_privilege('anon','public.dpp_api_import_commit(uuid)','EXECUTE') then
    raise exception 'M20 import API leaked anon EXECUTE';
  end if;

  if not has_function_privilege('authenticated','public.dpp_api_import_create(jsonb,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_import_get(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_import_validate(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_import_commit(uuid)','EXECUTE') then
    raise exception 'M20 import API missing authenticated EXECUTE';
  end if;

  if has_function_privilege('authenticated','public.dpp_validate_import(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.dpp_commit_import(uuid)','EXECUTE') then
    raise exception 'M20 internal import functions became directly executable';
  end if;
end
$m20api$;

select 'M20_IMPORT_API_SUBSET_PASS' as result;
