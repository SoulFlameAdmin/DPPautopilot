-- Step 18 integration acceptance: DRAFT -> readiness -> ACTIVE, fail-closed.

do $seed$
declare
  u_owner uuid := 'e1111111-1111-4111-8111-111111111111';
  org_a uuid := 'e2222222-2222-4222-8222-222222222222';
  model_a uuid := 'e3333333-3333-4333-8333-333333333333';
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
  values (org_a,'Step18 Org','step18-org');

  insert into public.dpp_organization_members(organization_id,user_id,role)
  values (org_a,u_owner,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values (
    model_a,org_a,'S18-LMT-A','Step18 Maker','light_means_of_transport',
    '{"identification":{"model_id":"S18-LMT-A","category":"light_means_of_transport","manufacturer":{"name":"Step18 Maker"}}}'::jsonb
  );
end
$seed$;

do $step18$
declare
  org_a uuid := 'e2222222-2222-4222-8222-222222222222';
  model_a uuid := 'e3333333-3333-4333-8333-333333333333';
  first_result jsonb;
  report jsonb;
  activated jsonb;
  item_id uuid;
  passport_id uuid;
  passport_updated timestamptz;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','e1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  first_result:=public.dpp_api_scooter_battery_provision(
    model_a,
    'urn:dpp:step18:lmt:000001',
    '{}'::jsonb,
    '{
      "passport":{"responsible_economic_operator":{"name":"Step18 Operator","identifier":"STEP18-EO"}},
      "model":{"identification":{"category":"light_means_of_transport","model_id":"S18-LMT-A","manufacturer":{"name":"Step18 Maker"}}},
      "item":{"unique_identifier":"urn:dpp:step18:lmt:000001"}
    }'::jsonb,
    '{}'::jsonb
  );

  item_id:=(first_result->>'item_id')::uuid;
  passport_id:=(first_result->>'passport_id')::uuid;
  passport_updated:=(first_result->>'updated_at')::timestamptz;

  if first_result->>'passport_status'<>'draft'
     or (first_result->>'activation_required')::boolean is not true then
    raise exception 'STEP18 draft-first provisioning failed';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_passport_public('urn:dpp:step18:lmt:000001');
  exception when sqlstate 'DP402' then seen:=true;
  end;
  if not seen then raise exception 'STEP18 draft passport leaked publicly'; end if;

  report:=public.dpp_api_scooter_passport_readiness(passport_id);
  if (report->>'ready')::boolean is true
     or (report->>'missing_count')::integer=0
     or (report->>'undecided_count')::integer=0 then
    raise exception 'STEP18 incomplete readiness report did not fail closed';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_passport_update_checked(
      passport_id,'active',null,null,passport_updated
    );
  exception when sqlstate 'DP610' then seen:=true;
  end;
  if not seen then raise exception 'STEP18 generic PATCH bypassed activation route'; end if;

  seen:=false;
  begin
    perform public.dpp_api_scooter_passport_activate(passport_id,passport_updated);
  exception when sqlstate 'DP609' then seen:=true;
  end;
  if not seen then raise exception 'STEP18 undecided conditional activation was accepted'; end if;

  update public.dpp_battery_models
  set canonical_data='{
    "identification":{
      "manufacturer":{"name":"Step18 Maker","postal_address":"1 Test Street, EU"},
      "category":"light_means_of_transport",
      "model_id":"S18-LMT-A",
      "place_of_manufacture":"Test City, EU",
      "date_of_manufacture":"2026-10"
    },
    "physical":{"weight_kg":12.8},
    "rated_capacity_ah":20,
    "composition":{
      "chemistry":"Lithium-ion NMC",
      "hazardous_substances":[],
      "critical_raw_materials":[{"material":"Lithium","share_percent":2.8}]
    },
    "safety":{"usable_extinguishing_agent":"Water for cooling"},
    "renewable_content_share":0,
    "voltage":{"minimum_v":39,"nominal_v":48,"maximum_v":54.6},
    "power_capability":{"original_w":2200,"limits":{"continuous_w":1400}},
    "expected_lifetime":{"cycles":800,"reference_test":"S18-CYCLE"},
    "storage_temperature":{"minimum_c":-20,"maximum_c":45,"reference_test":"S18-STORAGE"},
    "energy_efficiency":{"initial_round_trip_pct":93.1,"at_50_percent_cycle_life_pct":90.3},
    "internal_resistance":{"cell_ohm":0.0024,"pack_ohm":0.0682},
    "c_rate_test":1,
    "markings":{"article_13_4":{"separate_collection_symbol":true}},
    "eu_declaration_of_conformity":"S18-EU-DOC",
    "waste_information":{"collection":"Authorised collection point"},
    "restricted_composition":{"cathode":"NMC","anode":"graphite","electrolyte":"synthetic"},
    "spares":{"part_numbers":["S18-PART-1"],"source_contacts":["parts@example.invalid"]},
    "disassembly":{"sequence":["Isolate","Open"]},
    "safety_measures":{"service":"HV isolation"},
    "point_applicability":{"35":false,"41":false}
  }'::jsonb
  where id=model_a and organization_id=org_a;

  update public.dpp_battery_items
  set canonical_data='{
    "performance":{
      "rated_capacity_ah":20,
      "capacity_fade_pct":0,
      "power_w":2200,
      "power_fade_pct":0,
      "internal_resistance_ohm":0.0682,
      "internal_resistance_increase_pct":0,
      "round_trip_efficiency_pct":93.1,
      "round_trip_efficiency_fade_pct":0,
      "expected_lifetime_cycles":800,
      "expected_lifetime_calendar_years":5
    },
    "state_of_health":{
      "remaining_capacity":20,
      "remaining_power_capability":2200,
      "remaining_round_trip_efficiency":93.1,
      "self_discharge_rate":0.5,
      "ohmic_resistance":0.0682
    },
    "point_applicability":{"57":true,"58":true,"68":false,"69":false,"70":false,"71":false}
  }'::jsonb
  where id=item_id and organization_id=org_a;

  insert into public.dpp_authority_evidence(
    organization_id,model_id,field_number,evidence,created_by
  ) values (
    org_a,model_a,50,'{"document_ref":"S18-AUTH-TEST-REPORT"}'::jsonb,
    'e1111111-1111-4111-8111-111111111111'
  );

  report:=public.dpp_api_scooter_passport_readiness(passport_id);
  if (report->>'ready')::boolean is not true
     or (report->>'missing_count')::integer<>0
     or (report->>'undecided_count')::integer<>0 then
    raise exception 'STEP18 complete LMT passport did not become ready: %',report;
  end if;

  activated:=public.dpp_api_scooter_passport_activate(passport_id,passport_updated);
  if activated->>'status'<>'active' then
    raise exception 'STEP18 activation did not produce ACTIVE passport';
  end if;

  if (public.dpp_api_passport_public('urn:dpp:step18:lmt:000001')->>'passport_id')::uuid<>passport_id then
    raise exception 'STEP18 activated passport did not become publicly resolvable';
  end if;

  if has_function_privilege('anon','public.dpp_api_scooter_passport_readiness(uuid)','EXECUTE')
     or has_function_privilege('anon','public.dpp_api_scooter_passport_activate(uuid,timestamp with time zone)','EXECUTE') then
    raise exception 'STEP18 readiness/activation RPC leaked anon EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_scooter_passport_readiness(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_scooter_passport_activate(uuid,timestamp with time zone)','EXECUTE') then
    raise exception 'STEP18 authenticated readiness/activation grant missing';
  end if;
end
$step18$;

select 'STEP18_LMT_ACTIVATION_GATE_PASS' as result;
