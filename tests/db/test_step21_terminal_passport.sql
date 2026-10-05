-- Step 21 DB acceptance: public tombstones and tenant-safe replacement transitions.

do $seed$
declare
  u_owner uuid := '21111111-1111-4111-8111-111111111111';
  org_a uuid := '21222222-2222-4222-8222-222222222222';
  model_a uuid := '21333333-3333-4333-8333-333333333333';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false)',
      u_owner
    );
  else
    insert into auth.users(id) values (u_owner);
  end if;

  insert into public.dpp_organizations(id,name,slug)
  values (org_a,'Step21 Org','step21-org');

  insert into public.dpp_organization_members(organization_id,user_id,role)
  values (org_a,u_owner,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values (
    model_a,org_a,'S21-LMT-A','Step21 Maker','light_means_of_transport','{}'::jsonb
  );

  insert into public.dpp_battery_items(id,organization_id,model_id,unique_identifier,canonical_data)
  values
    ('21444444-4444-4444-8444-444444444441',org_a,model_a,'urn:dpp:step21:revoked','{}'::jsonb),
    ('21444444-4444-4444-8444-444444444442',org_a,model_a,'urn:dpp:step21:replaced','{}'::jsonb),
    ('21444444-4444-4444-8444-444444444443',org_a,model_a,'urn:dpp:step21:retired','{}'::jsonb),
    ('21444444-4444-4444-8444-444444444444',org_a,model_a,'urn:dpp:step21:replacement-active','{}'::jsonb);

  insert into public.dpp_passports(id,organization_id,battery_item_id,status,public_payload,private_payload)
  values
    ('21555555-5555-4555-8555-555555555551',org_a,'21444444-4444-4444-8444-444444444441','active','{"model":{"identification":{"manufacturer":{"name":"Old public maker"}}},"item":{"unique_identifier":"urn:dpp:step21:revoked"}}'::jsonb,'{}'::jsonb),
    ('21555555-5555-4555-8555-555555555552',org_a,'21444444-4444-4444-8444-444444444442','active','{"item":{"unique_identifier":"urn:dpp:step21:replaced"}}'::jsonb,'{}'::jsonb),
    ('21555555-5555-4555-8555-555555555553',org_a,'21444444-4444-4444-8444-444444444443','active','{"item":{"unique_identifier":"urn:dpp:step21:retired"}}'::jsonb,'{}'::jsonb),
    ('21555555-5555-4555-8555-555555555554',org_a,'21444444-4444-4444-8444-444444444444','active','{"item":{"unique_identifier":"urn:dpp:step21:replacement-active"}}'::jsonb,'{}'::jsonb);
end
$seed$;

do $step21$
declare
  org_a uuid := '21222222-2222-4222-8222-222222222222';
  p jsonb;
  updated_at_value timestamptz;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','21111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  select updated_at into updated_at_value from public.dpp_passports where id='21555555-5555-4555-8555-555555555551';
  perform public.dpp_api_passport_terminalize(
    '21555555-5555-4555-8555-555555555551','revoked',null,updated_at_value
  );
  p:=public.dpp_api_passport_public('urn:dpp:step21:revoked');
  if p->>'public_state'<>'revoked' or p->>'status'<>'suspended'
     or p->'public_payload'<>'{}'::jsonb or p->>'replacement_identifier' is not null then
    raise exception 'STEP21 revoked tombstone mismatch: %',p;
  end if;
  raise notice 'STEP21_REVOKED_PASS';

  select updated_at into updated_at_value from public.dpp_passports where id='21555555-5555-4555-8555-555555555552';
  perform public.dpp_api_passport_terminalize(
    '21555555-5555-4555-8555-555555555552','replaced','urn:dpp:step21:replacement-active',updated_at_value
  );
  p:=public.dpp_api_passport_public('urn:dpp:step21:replaced');
  if p->>'public_state'<>'replaced' or p->>'status'<>'retired'
     or p->>'replacement_identifier'<>'urn:dpp:step21:replacement-active'
     or p->'public_payload'<>'{}'::jsonb then
    raise exception 'STEP21 replaced tombstone mismatch: %',p;
  end if;
  if public.dpp_api_passport_public('urn:dpp:step21:replacement-active')->>'public_state'<>'active' then
    raise exception 'STEP21 replacement target stopped being ACTIVE';
  end if;
  raise notice 'STEP21_REPLACED_PASS';

  select updated_at into updated_at_value from public.dpp_passports where id='21555555-5555-4555-8555-555555555553';
  perform public.dpp_api_passport_terminalize(
    '21555555-5555-4555-8555-555555555553','retired',null,updated_at_value
  );
  p:=public.dpp_api_passport_public('urn:dpp:step21:retired');
  if p->>'public_state'<>'retired' or p->>'status'<>'retired' or p->'public_payload'<>'{}'::jsonb then
    raise exception 'STEP21 retired tombstone mismatch: %',p;
  end if;
  raise notice 'STEP21_RETIRED_PASS';

  seen:=false;
  begin
    select updated_at into updated_at_value from public.dpp_passports where id='21555555-5555-4555-8555-555555555554';
    perform public.dpp_api_passport_terminalize(
      '21555555-5555-4555-8555-555555555554','replaced','urn:dpp:step21:missing',updated_at_value
    );
  exception when sqlstate 'DP613' then seen:=true;
  end;
  if not seen then raise exception 'STEP21 invalid replacement was accepted'; end if;

  if has_function_privilege('anon','public.dpp_api_passport_terminalize(uuid,text,text,timestamp with time zone)','EXECUTE') then
    raise exception 'STEP21 terminalize RPC leaked anon EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_passport_terminalize(uuid,text,text,timestamp with time zone)','EXECUTE') then
    raise exception 'STEP21 authenticated terminalize grant missing';
  end if;
  raise notice 'STEP21_REPLACEMENT_GUARD_PASS';
end
$step21$;

select 'STEP21_TERMINAL_PASSPORT_DB_PASS' as result;
