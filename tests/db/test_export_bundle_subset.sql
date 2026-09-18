-- M21 partial integration/security coverage for tenant-scoped export bundle.
-- CI wraps this file in a transaction and rolls it back.

do $seed$
declare
  u_owner uuid := 'c1111111-1111-4111-8111-111111111111';
  u_admin uuid := 'c2222222-2222-4222-8222-222222222222';
  u_editor uuid := 'c3333333-3333-4333-8333-333333333333';
  u_viewer uuid := 'c4444444-4444-4444-8444-444444444444';
  u_other uuid := 'c5555555-5555-4555-8555-555555555555';
  org_a uuid := 'c6666666-6666-4666-8666-666666666666';
  org_b uuid := 'c7777777-7777-4777-8777-777777777777';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_admin,u_editor,u_viewer,u_other
    );
  else
    insert into auth.users(id) values (u_owner),(u_admin),(u_editor),(u_viewer),(u_other);
  end if;

  perform set_config('request.jwt.claim.sub',u_owner::text,true);

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'M21 Org A','m21-org-a'),
    (org_b,'M21 Org B','m21-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_admin,'admin'),
    (org_a,u_editor,'editor'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data,created_by
  ) values
    ('c8888888-8888-4888-8888-888888888888',org_a,'M21-MODEL-A','Maker A','electric_vehicle','{"public":"A"}'::jsonb,u_owner),
    ('c9999999-9999-4999-8999-999999999999',org_b,'M21-MODEL-B','Maker B','industrial','{"public":"B"}'::jsonb,u_other);

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by
  ) values
    ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',org_a,'c8888888-8888-4888-8888-888888888888','urn:dpp:m21:a:1','original','{"serial":"A1"}'::jsonb,u_owner),
    ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',org_b,'c9999999-9999-4999-8999-999999999999','urn:dpp:m21:b:1','original','{"serial":"B1"}'::jsonb,u_other);

  insert into public.dpp_passports(
    id,organization_id,battery_item_id,status,public_payload,private_payload,created_by
  ) values
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',org_a,'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active',
      '{"item":{"unique_identifier":"urn:dpp:m21:a:1"}}'::jsonb,'{"private":"A-secret"}'::jsonb,u_owner),
    ('cddddddd-dddd-4ddd-8ddd-dddddddddddd',org_b,'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active',
      '{"item":{"unique_identifier":"urn:dpp:m21:b:1"}}'::jsonb,'{"private":"B-secret"}'::jsonb,u_other);

  insert into public.dpp_evidence_attachments(
    id,organization_id,related_record_type,related_record_id,storage_path,
    original_filename,content_type,byte_size,sha256_hex,metadata,created_by
  ) values
    ('ceeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',org_a,'passport','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      org_a::text||'/evidence/passport-a/report.pdf','report.pdf','application/pdf',2048,repeat('a',64),
      '{"source":"lab"}'::jsonb,u_owner),
    ('cfffffff-ffff-4fff-8fff-ffffffffffff',org_b,'passport','cddddddd-dddd-4ddd-8ddd-dddddddddddd',
      org_b::text||'/evidence/passport-b/report.pdf','report.pdf','application/pdf',1024,repeat('b',64),
      '{"source":"other"}'::jsonb,u_other);

  update public.dpp_passports
  set private_payload='{"private":"A-secret-v2"}'::jsonb
  where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
end
$seed$;

do $m21$
declare
  org_a uuid := 'c6666666-6666-4666-8666-666666666666';
  org_b uuid := 'c7777777-7777-4777-8777-777777777777';
  payload jsonb;
  seen boolean;
begin
  -- Owner gets a complete own-tenant bundle.
  perform set_config('request.jwt.claim.sub','c1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_export_bundle();

  if payload->>'organization_id'<>org_a::text then
    raise exception 'M21 export organization id mismatch';
  end if;
  if (payload#>>'{counts,battery_models}')::int<>1
     or (payload#>>'{counts,battery_items}')::int<>1
     or (payload#>>'{counts,passports}')::int<>1
     or (payload#>>'{counts,evidence_manifest}')::int<>1 then
    raise exception 'M21 primary record/evidence counts mismatch: %',payload->'counts';
  end if;
  if (payload#>>'{counts,passport_versions}')::int<2 then
    raise exception 'M21 passport version history missing: %',payload#>>'{counts,passport_versions}';
  end if;
  if (payload#>>'{counts,audit_log}')::int<1 then
    raise exception 'M21 audit history missing';
  end if;

  if payload::text like '%M21-MODEL-B%'
     or payload::text like '%urn:dpp:m21:b:1%'
     or payload::text like '%'||org_b::text||'%' then
    raise exception 'M21 export leaked cross-tenant records';
  end if;

  if payload#>>'{evidence_manifest,0,storage_bucket}'<>'dpp-evidence'
     or payload#>>'{evidence_manifest,0,sha256_hex}'<>repeat('a',64) then
    raise exception 'M21 evidence manifest metadata missing';
  end if;
  if (payload#>'{evidence_manifest,0}') ? 'object_bytes'
     or (payload#>'{evidence_manifest,0}') ? 'content_bytes'
     or (payload#>'{evidence_manifest,0}') ? 'signed_url' then
    raise exception 'M21 evidence manifest unexpectedly contains object bytes/access URL';
  end if;

  -- Admin is allowed.
  perform set_config('request.jwt.claim.sub','c2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_export_bundle();
  if payload->>'organization_id'<>org_a::text then
    raise exception 'M21 admin export failed';
  end if;

  -- Editor and viewer are intentionally denied full/private export.
  perform set_config('request.jwt.claim.sub','c3333333-3333-4333-8333-333333333333',true);
  perform public.dpp_set_active_organization(org_a);
  seen:=false;
  begin
    perform public.dpp_api_export_bundle();
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M21 editor full export was not denied'; end if;

  perform set_config('request.jwt.claim.sub','c4444444-4444-4444-8444-444444444444',true);
  perform public.dpp_set_active_organization(org_a);
  seen:=false;
  begin
    perform public.dpp_api_export_bundle();
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M21 viewer full export was not denied'; end if;

  -- Other-tenant owner receives only org B.
  perform set_config('request.jwt.claim.sub','c5555555-5555-4555-8555-555555555555',true);
  perform public.dpp_set_active_organization(org_b);
  payload:=public.dpp_api_export_bundle();
  if payload->>'organization_id'<>org_b::text
     or payload::text like '%M21-MODEL-A%'
     or payload::text like '%urn:dpp:m21:a:1%' then
    raise exception 'M21 other-tenant export isolation failed';
  end if;

  if has_function_privilege('anon','public.dpp_api_export_bundle()','EXECUTE') then
    raise exception 'M21 export RPC leaked anon EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_export_bundle()','EXECUTE') then
    raise exception 'M21 export RPC missing authenticated EXECUTE';
  end if;
end
$m21$;

select 'M21_EXPORT_BUNDLE_SUBSET_PASS' as result;
