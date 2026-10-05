-- Step 21 acceptance: terminal lifecycle transitions keep old QR identifiers resolvable
-- as minimal public tombstones and never expose the old public/private payload.

do $seed$
declare
  u_owner uuid := '21111111-1111-4111-8111-111111111111';
  u_other uuid := '21111111-1111-4111-8111-222222222222';
  org_a uuid := '21222222-2222-4222-8222-222222222222';
  org_b uuid := '21222222-2222-4222-8222-333333333333';
  model_a uuid := '21333333-3333-4333-8333-333333333333';
  model_b uuid := '21333333-3333-4333-8333-444444444444';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_other
    );
  else
    insert into auth.users(id) values (u_owner),(u_other);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'Step21 Org A','step21-org-a'),
    (org_b,'Step21 Org B','step21-org-b');
  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),(org_b,u_other,'owner');

  insert into public.dpp_battery_models(id,organization_id,model_identifier,manufacturer_name,category,canonical_data) values
    (model_a,org_a,'S21-A','Step21 Maker A','light_means_of_transport','{}'::jsonb),
    (model_b,org_b,'S21-B','Step21 Maker B','light_means_of_transport','{}'::jsonb);

  insert into public.dpp_battery_items(id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by) values
    ('21444444-4444-4444-8444-444444444441',org_a,model_a,'urn:dpp:step21:old-replaced','original','{}'::jsonb,u_owner),
    ('21444444-4444-4444-8444-444444444442',org_a,model_a,'urn:dpp:step21:new-active','original','{}'::jsonb,u_owner),
    ('21444444-4444-4444-8444-444444444443',org_a,model_a,'urn:dpp:step21:retire','original','{}'::jsonb,u_owner),
    ('21444444-4444-4444-8444-444444444444',org_a,model_a,'urn:dpp:step21:revoke','original','{}'::jsonb,u_owner),
    ('21444444-4444-4444-8444-444444444445',org_b,model_b,'urn:dpp:step21:other','original','{}'::jsonb,u_other);

  insert into public.dpp_passports(id,organization_id,battery_item_id,status,public_payload,private_payload,created_by) values
    ('21555555-5555-4555-8555-555555555551',org_a,'21444444-4444-4444-8444-444444444441','active','{"secret_marker":"PUBLIC-OLD"}'::jsonb,'{"private_marker":"PRIVATE-OLD"}'::jsonb,u_owner),
    ('21555555-5555-4555-8555-555555555552',org_a,'21444444-4444-4444-8444-444444444442','active','{"title":"Replacement"}'::jsonb,'{}'::jsonb,u_owner),
    ('21555555-5555-4555-8555-555555555553',org_a,'21444444-4444-4444-8444-444444444443','active','{"title":"Retire me"}'::jsonb,'{}'::jsonb,u_owner),
    ('21555555-5555-4555-8555-555555555554',org_a,'21444444-4444-4444-8444-444444444444','active','{"title":"Revoke me"}'::jsonb,'{}'::jsonb,u_owner),
    ('21555555-5555-4555-8555-555555555555',org_b,'21444444-4444-4444-8444-444444444445','active','{"title":"Other"}'::jsonb,'{}'::jsonb,u_other);
end
$seed$;

do $step21$
declare
  org_a uuid := '21222222-2222-4222-8222-222222222222';
  replaced_id uuid := '21555555-5555-4555-8555-555555555551';
  retired_id uuid := '21555555-5555-4555-8555-555555555553';
  revoked_id uuid := '21555555-5555-4555-8555-555555555554';
  r jsonb;
  before_ts timestamptz;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','21111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  r:=public.dpp_api_passport_public_resolve('urn:dpp:step21:old-replaced');
  if r->>'kind'<>'active' or r->>'status'<>'active' or not (r ? 'public_payload') then
    raise exception 'STEP21 active resolver regression: %',r;
  end if;

  select updated_at into before_ts from public.dpp_passports where id=replaced_id;
  perform public.dpp_api_scooter_passport_transition(
    replaced_id,'replaced','product_replaced','Internal replacement note',
    'urn:dpp:step21:new-active',before_ts
  );

  r:=public.dpp_api_passport_public_resolve('urn:dpp:step21:old-replaced');
  if r->>'kind'<>'lifecycle' or r->>'status'<>'replaced'
     or r->>'replacement_identifier'<>'urn:dpp:step21:new-active' then
    raise exception 'STEP21 replaced tombstone malformed: %',r;
  end if;
  if r ? 'public_payload' or r ? 'private_payload' or r ? 'reason_note'
     or r::text like '%PUBLIC-OLD%' or r::text like '%PRIVATE-OLD%' or r::text like '%Internal replacement note%' then
    raise exception 'STEP21 replaced tombstone leaked payload/note: %',r;
  end if;

  r:=public.dpp_api_passport_public_resolve('urn:dpp:step21:new-active');
  if r->>'kind'<>'active' or r->>'status'<>'active' then
    raise exception 'STEP21 replacement target is not active: %',r;
  end if;

  select updated_at into before_ts from public.dpp_passports where id=retired_id;
  perform public.dpp_api_scooter_passport_transition(
    retired_id,'retired','end_of_life','Internal retired note',null,before_ts
  );
  r:=public.dpp_api_passport_public_resolve('urn:dpp:step21:retire');
  if r->>'status'<>'retired' or r->>'replacement_identifier' is not null or r ? 'public_payload' then
    raise exception 'STEP21 retired tombstone malformed: %',r;
  end if;

  select updated_at into before_ts from public.dpp_passports where id=revoked_id;
  perform public.dpp_api_scooter_passport_transition(
    revoked_id,'revoked','operator_revoked','Internal revoked note',null,before_ts
  );
  r:=public.dpp_api_passport_public_resolve('urn:dpp:step21:revoke');
  if r->>'status'<>'revoked' or r->>'replacement_identifier' is not null or r ? 'public_payload' then
    raise exception 'STEP21 revoked tombstone malformed: %',r;
  end if;

  seen:=false;
  begin
    perform public.dpp_api_passport_update_checked(
      '21555555-5555-4555-8555-555555555552','retired',null,null,
      (select updated_at from public.dpp_passports where id='21555555-5555-4555-8555-555555555552')
    );
  exception when sqlstate 'DP612' then seen:=true;
  end;
  if not seen then raise exception 'STEP21 generic PATCH bypassed lifecycle route'; end if;

  seen:=false;
  begin
    perform public.dpp_api_scooter_passport_transition(
      '21555555-5555-4555-8555-555555555555','revoked','operator_revoked',null,null,
      (select updated_at from public.dpp_passports where id='21555555-5555-4555-8555-555555555555')
    );
  exception when sqlstate 'DP403' then seen:=true;
  end;
  if not seen then raise exception 'STEP21 cross-tenant lifecycle transition was accepted'; end if;

  if has_function_privilege('anon','public.dpp_api_scooter_passport_transition(uuid,text,text,text,text,timestamp with time zone)','EXECUTE') then
    raise exception 'STEP21 transition RPC leaked anon EXECUTE';
  end if;
  if not has_function_privilege('anon','public.dpp_api_passport_public_resolve(text)','EXECUTE') then
    raise exception 'STEP21 public resolver missing anon EXECUTE';
  end if;
end
$step21$;

select 'STEP21_PASSPORT_LIFECYCLE_UX_PASS' as result;
