-- Manufacturer Pilot V1: tenant-scoped 8-answer onboarding DB acceptance.
-- CI wraps this file in BEGIN/ROLLBACK.

do $test$
declare
  owner_id uuid := 'f1111111-1111-4111-8111-111111111111';
  viewer_id uuid := 'f2222222-2222-4222-8222-222222222222';
  editor_id uuid := 'f3333333-3333-4333-8333-333333333333';
  outsider_id uuid := 'f4444444-4444-4444-8444-444444444444';
  org_a uuid;
  org_b uuid;
  state jsonb;
  result jsonb;
  denied boolean;
  i integer;
  expected_steps jsonb := '[{"key":"company","status":"done"},{"key":"workflow","status":"done"},{"key":"product","status":"done"},{"key":"batch","status":"done"},{"key":"dpp","status":"done"},{"key":"qr","status":"done"},{"key":"ready","status":"done"}]';
begin
  insert into auth.users(id) values(owner_id),(viewer_id),(editor_id),(outsider_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.dpp_api_organization_create('Manufacturer Onboarding A','manufacturer-onboarding-a');
  org_a:=(result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_members_add(viewer_id,'viewer');
  perform public.dpp_api_members_add(editor_id,'editor');

  state:=public.dpp_api_manufacturer_onboarding_get();
  if (state->>'organization_id')::uuid<>org_a
     or (state->>'answered_count')::integer<>0
     or state->'answers'<>'[]'::jsonb
     or (state->>'complete')::boolean is not false
     or state->'configuration'<>'null'::jsonb then
    raise exception 'Fresh tenant onboarding state is not empty';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_manufacturer_onboarding_configure();
  exception when sqlstate 'DP501' then denied:=true;
  end;
  if not denied then raise exception 'Incomplete onboarding configured successfully'; end if;

  for i in 1..8 loop
    result:=public.dpp_api_manufacturer_onboarding_answer_upsert(
      'onboardingQ'||i,
      '  Answer '||i||'  ',
      jsonb_build_object('question',i,'source','db_acceptance')
    );
    if result->>'organization_id'<>org_a::text
       or result->>'user_id'<>owner_id::text
       or result->>'raw_answer'<>'Answer '||i then
      raise exception 'Onboarding answer % persistence/ownership mismatch',i;
    end if;
  end loop;

  -- Upsert is replacement, not duplicate completion.
  perform public.dpp_api_manufacturer_onboarding_answer_upsert(
    'onboardingQ1','Updated company','{"company":"Manufacturer A"}'::jsonb
  );
  state:=public.dpp_api_manufacturer_onboarding_get();
  if (state->>'answered_count')::integer<>8
     or jsonb_array_length(state->'answers')<>8
     or (state->>'complete')::boolean is not true
     or state->'configuration'<>'null'::jsonb then
    raise exception 'Eight-answer completion/readback is invalid';
  end if;

  result:=public.dpp_api_manufacturer_onboarding_configure();
  if result->>'status'<>'configured'
     or (result->>'revision')::integer<>1
     or result->'steps'<>expected_steps then
    raise exception 'Initial configuration result is invalid';
  end if;

  state:=public.dpp_api_manufacturer_onboarding_get();
  if state#>>'{configuration,company_identity,raw_answer}'<>'Updated company'
     or state#>>'{configuration,configured_by}'<>owner_id::text then
    raise exception 'Configured tenant defaults were not persisted';
  end if;

  -- Viewer may read but cannot write/configure.
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  state:=public.dpp_api_manufacturer_onboarding_get();
  if (state->>'answered_count')::integer<>8 then
    raise exception 'Viewer cannot read tenant onboarding';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_manufacturer_onboarding_answer_upsert('onboardingQ1','Unauthorized','{}');
  exception when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Viewer gained onboarding write access'; end if;

  denied:=false;
  begin
    perform public.dpp_api_manufacturer_onboarding_configure();
  exception when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Viewer gained configure access'; end if;

  -- Editor may update and explicitly regenerate configuration.
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_manufacturer_onboarding_answer_upsert(
    'onboardingQ8','Changed QR printer','{"method":"label_printer"}'::jsonb
  );
  result:=public.dpp_api_manufacturer_onboarding_configure();
  state:=public.dpp_api_manufacturer_onboarding_get();
  if (result->>'revision')::integer<>2
     or state#>>'{configuration,configured_by}'<>editor_id::text
     or state#>>'{configuration,qr_print_method,raw_answer}'<>'Changed QR printer' then
    raise exception 'Editor reconfiguration did not persist correctly';
  end if;

  -- Separate tenant gets a clean state.
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  result:=public.dpp_api_organization_create('Manufacturer Onboarding B','manufacturer-onboarding-b');
  org_b:=(result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_b);
  state:=public.dpp_api_manufacturer_onboarding_get();
  if (state->>'organization_id')::uuid<>org_b
     or (state->>'answered_count')::integer<>0
     or state->'configuration'<>'null'::jsonb then
    raise exception 'Onboarding data leaked across tenants';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_tenant_context_set(org_a);
  exception when sqlstate 'DP102' then denied:=true;
  end;
  if not denied then raise exception 'Outsider selected another tenant'; end if;

  -- Membership revocation must fail closed. Depending on context cleanup,
  -- the denial may be no active tenant (DP103) or unauthorized role (DP104).
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_members_delete(viewer_id);
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  denied:=false;
  begin
    perform public.dpp_api_manufacturer_onboarding_get();
  exception
    when sqlstate 'DP103' then denied:=true;
    when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Revoked viewer retained onboarding access'; end if;

  perform set_config('request.jwt.claim.sub','',true);
  denied:=false;
  begin
    perform public.dpp_api_manufacturer_onboarding_get();
  exception when sqlstate 'DP101' then denied:=true;
  end;
  if not denied then raise exception 'Missing identity retained onboarding access'; end if;

  -- Configure derives defaults only; it must never fabricate product/item rows.
  execute 'reset role';
  if exists(select 1 from public.dpp_battery_models where organization_id=org_a)
     or exists(select 1 from public.dpp_battery_items where organization_id=org_a) then
    raise exception 'Onboarding configuration fabricated product records';
  end if;
end
$test$;

select 'MANUFACTURER_ONBOARDING_DB_PASS' as result;
