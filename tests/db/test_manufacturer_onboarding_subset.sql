-- Isolated PostgreSQL acceptance for the Engine RPC contract, not live Supabase evidence.
-- Caller wraps in BEGIN/ROLLBACK. Fixtures are synthetic; RPCs run as real client roles.
do $test$
declare
  owner_id uuid := 'a1111111-1111-4111-8111-111111111111';
  viewer_id uuid := 'a2222222-2222-4222-8222-222222222222';
  editor_id uuid := 'a3333333-3333-4333-8333-333333333333';
  outsider_id uuid := 'a4444444-4444-4444-8444-444444444444';
  org_a uuid;
  org_b uuid;
  state jsonb;
  result jsonb;
  denied boolean;
  i integer;
  expected_steps jsonb := '[{"key":"company","status":"done"},{"key":"workflow","status":"done"},{"key":"product","status":"done"},{"key":"batch","status":"done"},{"key":"dpp","status":"done"},{"key":"qr","status":"done"},{"key":"ready","status":"done"}]';
begin
  insert into auth.users(id) values (owner_id),(viewer_id),(editor_id),(outsider_id);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result := public.dpp_api_organization_create('Onboarding Test A','onboarding-test-a');
  org_a := (result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_members_add(viewer_id,'viewer');
  perform public.dpp_api_members_add(editor_id,'editor');

  state := public.dpp_api_manufacturer_onboarding_get();
  if (state->>'answered_count')::integer <> 0 or state->'answers' <> '[]'::jsonb
     or state->'complete' <> 'false'::jsonb or state->'configuration' <> 'null'::jsonb then
    raise exception 'New organization must have empty onboarding state';
  end if;
  denied := false;
  begin
    perform public.dpp_api_manufacturer_onboarding_configure();
  exception when sqlstate 'DP501' then denied := true;
  end;
  if not denied then raise exception 'Configure accepted incomplete onboarding'; end if;

  for i in 1..8 loop
    result := public.dpp_api_manufacturer_onboarding_answer_upsert(
      'onboardingQ'||i,'  Synthetic answer '||i||'  ',jsonb_build_object('source','test','question',i));
    if result->>'organization_id' <> org_a::text or result->>'user_id' <> owner_id::text
       or result->>'raw_answer' <> 'Synthetic answer '||i then
      raise exception 'Answer % was not saved under the active tenant/user or trimmed',i;
    end if;
  end loop;
  -- Upserting a question must replace it rather than inflating completion.
  perform public.dpp_api_manufacturer_onboarding_answer_upsert('onboardingQ1','Updated company','{"company":"Synthetic"}');
  state := public.dpp_api_manufacturer_onboarding_get();
  if (state->>'answered_count')::integer <> 8 or jsonb_array_length(state->'answers') <> 8
     or state->'complete' <> 'true'::jsonb or state->'configuration' <> 'null'::jsonb
     or state->'answers'->0->>'raw_answer' <> 'Updated company' then
    raise exception 'Saved answers failed readback/completion before Configure';
  end if;
  result := public.dpp_api_manufacturer_onboarding_configure();
  if result->>'organization_id' <> org_a::text or result->>'status' <> 'configured'
     or (result->>'revision')::integer <> 1 or result->'steps' <> expected_steps then
    raise exception 'Configure returned incorrect revision or progress states';
  end if;
  state := public.dpp_api_manufacturer_onboarding_get();
  if state->'configuration'->'company_identity'->>'raw_answer' <> 'Updated company'
     or state->'configuration'->>'configured_by' <> owner_id::text then
    raise exception 'Configuration was not persisted from saved answers';
  end if;

  -- Viewer may read, but cannot save or configure.
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  state := public.dpp_api_manufacturer_onboarding_get();
  if (state->>'answered_count')::integer <> 8 then raise exception 'Viewer cannot read own onboarding'; end if;
  denied := false;
  begin
    perform public.dpp_api_manufacturer_onboarding_answer_upsert('onboardingQ1','Unauthorized','{}');
  exception when sqlstate 'DP104' then denied := true;
  end;
  if not denied then raise exception 'Viewer saved onboarding'; end if;
  denied := false;
  begin
    perform public.dpp_api_manufacturer_onboarding_configure();
  exception when sqlstate 'DP104' then denied := true;
  end;
  if not denied then raise exception 'Viewer configured onboarding'; end if;

  -- Editor can change answers and explicitly regenerate the stored configuration.
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_manufacturer_onboarding_answer_upsert('onboardingQ8','Changed print method','{"format":"test-label"}');
  result := public.dpp_api_manufacturer_onboarding_configure();
  state := public.dpp_api_manufacturer_onboarding_get();
  if (result->>'revision')::integer <> 2
     or state->'configuration'->>'configured_by' <> editor_id::text
     or state->'configuration'->'qr_print_method'->>'raw_answer' <> 'Changed print method' then
    raise exception 'Editor reconfiguration did not persist revision and saved QR preference';
  end if;

  -- Separate organizations must not share onboarding data or active context.
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  result := public.dpp_api_organization_create('Onboarding Test B','onboarding-test-b');
  org_b := (result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_b);
  state := public.dpp_api_manufacturer_onboarding_get();
  if state->>'organization_id' <> org_b::text or (state->>'answered_count')::integer <> 0
     or state->'configuration' <> 'null'::jsonb then
    raise exception 'Onboarding leaked across organizations';
  end if;
  denied := false;
  begin
    perform public.dpp_api_tenant_context_set(org_a);
  exception when sqlstate 'DP102' then denied := true;
  end;
  if not denied then raise exception 'Outsider selected another organization'; end if;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_members_delete(viewer_id);
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  denied := false;
  begin
    perform public.dpp_api_manufacturer_onboarding_get();
  exception when sqlstate 'DP104' then denied := true;
  end;
  if not denied then raise exception 'Revoked viewer retained onboarding access'; end if;

  perform set_config('request.jwt.claim.sub','',true);
  denied := false;
  begin
    perform public.dpp_api_manufacturer_onboarding_get();
  exception when sqlstate 'DP101' then denied := true;
  end;
  if not denied then raise exception 'Missing identity retained onboarding access'; end if;
  execute 'set local role anon';
  denied := false;
  begin
    perform public.dpp_api_manufacturer_onboarding_get();
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous role gained onboarding RPC access'; end if;
  execute 'reset role';
  if exists(select 1 from public.dpp_battery_models where organization_id=org_a)
     or exists(select 1 from public.dpp_battery_items where organization_id=org_a) then
    raise exception 'Company configuration fabricated product records';
  end if;
end
$test$;

select 'MANUFACTURER_ONBOARDING_DB_PASS' as result;
