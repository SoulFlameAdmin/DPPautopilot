-- Worker A / Worker B A2.1 acceptance. CI wraps this file in BEGIN/ROLLBACK.
-- Proves server-issued event envelope, exact idempotency, revision CAS, conflict review,
-- owner/admin final approval, later-change invalidation and no passport/publication authority.

do $test$
declare
  owner_id uuid := 'b6111111-1111-4111-8111-111111111111';
  viewer_id uuid := 'b6222222-2222-4222-8222-222222222222';
  org_id uuid;
  v_session_id uuid;
  request_turn uuid := 'b7000000-0000-4000-8000-000000000001';
  request_conflict uuid := 'b7000000-0000-4000-8000-000000000002';
  revision_now integer;
  initial_revision integer;
  result jsonb;
  retry jsonb;
  snapshot jsonb;
  company_original uuid;
  company_conflict uuid;
  candidate record;
  denied boolean;
begin
  insert into auth.users(id) values(owner_id),(viewer_id);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);

  result:=public.dpp_api_organization_create('AI CAS Org','ai-cas-org');
  org_id:=(result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_id);
  perform public.dpp_api_members_add(viewer_id,'viewer');

  result:=public.dpp_api_ai_intake_resume_or_create();
  v_session_id:=(result->>'id')::uuid;
  initial_revision:=(result->>'revision')::integer;

  result:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,initial_revision,request_turn,
    'Battery CAS Ltd is in Bulgaria. We make LMT packs, 8 SKUs, 12000 units/year. Compliance and engineering use ERP + BMS. Automate DPP onboarding.',
    jsonb_build_array(
      jsonb_build_object('key','country','value','Bulgaria','evidence','in Bulgaria'),
      jsonb_build_object('key','company','value','Battery CAS Ltd','evidence','Battery CAS Ltd'),
      jsonb_build_object('key','products','value','LMT packs','evidence','make LMT packs'),
      jsonb_build_object('key','sku','value','8 SKUs','evidence','8 SKUs'),
      jsonb_build_object('key','annualVolume','value','12000 units/year','evidence','12000 units/year'),
      jsonb_build_object('key','users','value','Compliance and engineering','evidence','Compliance and engineering'),
      jsonb_build_object('key','systems','value','ERP + BMS','evidence','ERP + BMS'),
      jsonb_build_object('key','automation','value','Automate DPP onboarding','evidence','Automate DPP onboarding')
    ),
    'openai/gpt-5.6-sol','conversation:cas:1'
  );
  revision_now:=(result->>'revision')::integer;
  if revision_now<>initial_revision+9
     or jsonb_array_length(result->'event_ids')<>9
     or jsonb_array_length(result->'candidate_ids')<>8
     or (result->>'idempotent_retry')::boolean is not false
     or (result->>'can_publish')::boolean is not false
     or (result->>'can_generate_battery_passport')::boolean is not false then
    raise exception 'CAS turn result mismatch';
  end if;

  -- Exact retry is idempotent even though the session revision already advanced.
  retry:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,initial_revision,request_turn,
    'Battery CAS Ltd is in Bulgaria. We make LMT packs, 8 SKUs, 12000 units/year. Compliance and engineering use ERP + BMS. Automate DPP onboarding.',
    jsonb_build_array(
      jsonb_build_object('key','country','value','Bulgaria','evidence','in Bulgaria'),
      jsonb_build_object('key','company','value','Battery CAS Ltd','evidence','Battery CAS Ltd'),
      jsonb_build_object('key','products','value','LMT packs','evidence','make LMT packs'),
      jsonb_build_object('key','sku','value','8 SKUs','evidence','8 SKUs'),
      jsonb_build_object('key','annualVolume','value','12000 units/year','evidence','12000 units/year'),
      jsonb_build_object('key','users','value','Compliance and engineering','evidence','Compliance and engineering'),
      jsonb_build_object('key','systems','value','ERP + BMS','evidence','ERP + BMS'),
      jsonb_build_object('key','automation','value','Automate DPP onboarding','evidence','Automate DPP onboarding')
    ),
    'openai/gpt-5.6-sol','conversation:cas:1'
  );
  if (retry->>'idempotent_retry')::boolean is not true
     or (retry->>'revision')::integer<>revision_now then
    raise exception 'Exact CAS retry was not idempotent';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_turn_save_cas(
      v_session_id,initial_revision,request_turn,'ALTERED RETRY','[]'::jsonb,
      'openai/gpt-5.6-sol','conversation:cas:1'
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Reused request id accepted altered content'; end if;

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_turn_save_cas(
      v_session_id,initial_revision,gen_random_uuid(),'STALE REVISION','[]'::jsonb,
      'openai/gpt-5.6-sol','conversation:cas:stale'
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Stale revision was accepted'; end if;

  snapshot:=public.dpp_api_ai_intake_snapshot(v_session_id);
  if jsonb_array_length(snapshot->'events')<>9
     or (snapshot#>>'{session,revision}')::integer<>revision_now then
    raise exception 'CAS event snapshot mismatch';
  end if;

  -- DB/server is authoritative for actor and event time/IDs.
  execute 'reset role';
  if exists(
    select 1 from public.dpp_ai_intake_events e
    where e.organization_id=org_id and e.session_id=v_session_id
      and (e.actor_id<>owner_id or e.event_id=e.request_id or e.occurred_at is null)
  ) then
    raise exception 'Server event authority mismatch';
  end if;
  if (select count(distinct revision) from public.dpp_ai_intake_events
      where organization_id=org_id and session_id=v_session_id)<>9 then
    raise exception 'Event revisions are not unique';
  end if;
  select id into company_original from public.dpp_ai_intake_candidates
  where organization_id=org_id and session_id=v_session_id and field_key='company'
  order by created_at,id limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);

  -- Add a conflicting company candidate.
  result:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,revision_now,request_conflict,
    'Correction: the company is Battery CAS AD.',
    jsonb_build_array(jsonb_build_object(
      'key','company','value','Battery CAS AD','evidence','company is Battery CAS AD'
    )),
    'openai/gpt-5.6-sol','conversation:cas:2'
  );
  revision_now:=(result->>'revision')::integer;
  if jsonb_array_length(result->'event_ids')<>2 then raise exception 'Conflict turn should create two events'; end if;

  execute 'reset role';
  select id into company_conflict from public.dpp_ai_intake_candidates
  where organization_id=org_id and session_id=v_session_id and field_key='company'
    and candidate_value='Battery CAS AD' order by created_at desc,id desc limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_candidate_review_cas(
      v_session_id,company_original,true,revision_now,gen_random_uuid()
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Conflicting candidate was verified before conflict resolution'; end if;

  result:=public.dpp_api_ai_intake_candidate_review_cas(
    v_session_id,company_conflict,false,revision_now,gen_random_uuid()
  );
  revision_now:=(result->>'revision')::integer;

  -- Verify the remaining eight original candidates one by one using atomic CAS.
  execute 'reset role';
  for candidate in
    select id from public.dpp_ai_intake_candidates
    where organization_id=org_id and session_id=v_session_id and verification_state='unverified'
    order by field_key,id
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    perform public.dpp_api_tenant_context_set(org_id);
    result:=public.dpp_api_ai_intake_candidate_review_cas(
      v_session_id,candidate.id,true,revision_now,gen_random_uuid()
    );
    revision_now:=(result->>'revision')::integer;
    execute 'reset role';
  end loop;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  result:=public.dpp_api_ai_intake_session_approve_cas(
    v_session_id,revision_now,gen_random_uuid()
  );
  revision_now:=(result->>'revision')::integer;
  if (result->>'can_generate_onboarding_configuration')::boolean is not true
     or (result->>'can_generate_battery_passport')::boolean is not false
     or (result->>'can_publish')::boolean is not false
     or (result->>'canonical_answers_written')::boolean is not false then
    raise exception 'Final approval authority escaped onboarding scope';
  end if;

  snapshot:=public.dpp_api_ai_intake_snapshot(v_session_id);
  if (snapshot->>'approved_count')::integer<>8
     or snapshot#>>'{session,approved_by}'<>owner_id::text
     or (snapshot#>>'{session,approved_revision}')::integer<>revision_now then
    raise exception 'Final human approval was not persisted';
  end if;

  -- Any later new candidate invalidates final approval and the affected field approval.
  result:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,revision_now,gen_random_uuid(),
    'Later correction: 9 SKUs.',
    jsonb_build_array(jsonb_build_object('key','sku','value','9 SKUs','evidence','9 SKUs')),
    'openai/gpt-5.6-sol','conversation:cas:3'
  );
  revision_now:=(result->>'revision')::integer;
  snapshot:=public.dpp_api_ai_intake_snapshot(v_session_id);
  if snapshot#>>'{session,approved_by}' is not null
     or (snapshot->>'approved_count')::integer<>7 then
    raise exception 'Later change did not revoke final/field approval';
  end if;

  -- Viewer can read event history but cannot review or approve.
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  snapshot:=public.dpp_api_ai_intake_snapshot(v_session_id);
  if jsonb_array_length(snapshot->'events')<20 then raise exception 'Viewer could not resume event history'; end if;

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_candidate_review_cas(
      v_session_id,company_original,false,revision_now,gen_random_uuid()
    );
  exception when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Viewer gained candidate review permission'; end if;

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_session_approve_cas(v_session_id,revision_now,gen_random_uuid());
  exception when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Viewer gained final approval permission'; end if;

  execute 'reset role';
  if exists(select 1 from public.dpp_manufacturer_onboarding_answers where organization_id=org_id)
     or exists(select 1 from public.dpp_battery_models where organization_id=org_id)
     or exists(select 1 from public.dpp_battery_items where organization_id=org_id)
     or exists(select 1 from public.dpp_passports where organization_id=org_id) then
    raise exception 'CAS conversation persistence produced canonical DPP side effects';
  end if;
end
$test$;

select 'AI_CONVERSATION_CAS_DB_PASS' as result;
