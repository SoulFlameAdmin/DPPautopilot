-- A2 actor-bound idempotency: same actor exact retries must remain idempotent
-- for all four CAS operations. CI wraps this file in BEGIN/ROLLBACK.

do $test$
declare
  owner_id uuid := 'd6111111-1111-4111-8111-111111111111';
  org_id uuid;
  v_session_id uuid;
  revision_now integer;
  expected_revision integer;
  request_turn uuid := 'd7000000-0000-4000-8000-000000000001';
  request_review uuid := 'd7000000-0000-4000-8000-000000000002';
  request_approve uuid := 'd7000000-0000-4000-8000-000000000003';
  request_manual uuid := 'd7000000-0000-4000-8000-000000000004';
  result jsonb;
  retry jsonb;
  country_candidate uuid;
  candidate record;
begin
  insert into auth.users(id) values(owner_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);

  result:=public.dpp_api_organization_create('AI Same Actor Retry Org','ai-same-actor-retry-org');
  org_id:=(result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_id);

  result:=public.dpp_api_ai_intake_resume_or_create();
  v_session_id:=(result->>'id')::uuid;
  revision_now:=(result->>'revision')::integer;

  expected_revision:=revision_now;
  result:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,expected_revision,request_turn,
    'Same Actor Ltd is in Bulgaria. We make LMT packs, 8 SKUs, 12000 units/year. Compliance and engineering use ERP + BMS. Automate DPP onboarding.',
    jsonb_build_array(
      jsonb_build_object('key','country','value','Bulgaria','evidence','in Bulgaria'),
      jsonb_build_object('key','company','value','Same Actor Ltd','evidence','Same Actor Ltd'),
      jsonb_build_object('key','products','value','LMT packs','evidence','make LMT packs'),
      jsonb_build_object('key','sku','value','8 SKUs','evidence','8 SKUs'),
      jsonb_build_object('key','annualVolume','value','12000 units/year','evidence','12000 units/year'),
      jsonb_build_object('key','users','value','Compliance and engineering','evidence','Compliance and engineering'),
      jsonb_build_object('key','systems','value','ERP + BMS','evidence','ERP + BMS'),
      jsonb_build_object('key','automation','value','Automate DPP onboarding','evidence','Automate DPP onboarding')
    ),
    'openai/gpt-5.6-sol','conversation:same-actor:1'
  );
  revision_now:=(result->>'revision')::integer;

  retry:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,expected_revision,request_turn,
    'Same Actor Ltd is in Bulgaria. We make LMT packs, 8 SKUs, 12000 units/year. Compliance and engineering use ERP + BMS. Automate DPP onboarding.',
    jsonb_build_array(
      jsonb_build_object('key','country','value','Bulgaria','evidence','in Bulgaria'),
      jsonb_build_object('key','company','value','Same Actor Ltd','evidence','Same Actor Ltd'),
      jsonb_build_object('key','products','value','LMT packs','evidence','make LMT packs'),
      jsonb_build_object('key','sku','value','8 SKUs','evidence','8 SKUs'),
      jsonb_build_object('key','annualVolume','value','12000 units/year','evidence','12000 units/year'),
      jsonb_build_object('key','users','value','Compliance and engineering','evidence','Compliance and engineering'),
      jsonb_build_object('key','systems','value','ERP + BMS','evidence','ERP + BMS'),
      jsonb_build_object('key','automation','value','Automate DPP onboarding','evidence','Automate DPP onboarding')
    ),
    'openai/gpt-5.6-sol','conversation:same-actor:1'
  );
  if (retry->>'idempotent_retry')::boolean is not true then
    raise exception 'turn.save same-actor retry lost idempotency';
  end if;

  execute 'reset role';
  select id into country_candidate
  from public.dpp_ai_intake_candidates
  where organization_id=org_id and session_id=v_session_id and field_key='country'
  order by created_at,id limit 1;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);

  expected_revision:=revision_now;
  result:=public.dpp_api_ai_intake_candidate_review_cas(
    v_session_id,country_candidate,true,expected_revision,request_review
  );
  revision_now:=(result->>'revision')::integer;
  retry:=public.dpp_api_ai_intake_candidate_review_cas(
    v_session_id,country_candidate,true,expected_revision,request_review
  );
  if (retry->>'idempotent_retry')::boolean is not true then
    raise exception 'candidate.review same-actor retry lost idempotency';
  end if;

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
  expected_revision:=revision_now;
  result:=public.dpp_api_ai_intake_session_approve_cas(
    v_session_id,expected_revision,request_approve
  );
  revision_now:=(result->>'revision')::integer;
  retry:=public.dpp_api_ai_intake_session_approve_cas(
    v_session_id,expected_revision,request_approve
  );
  if (retry->>'idempotent_retry')::boolean is not true then
    raise exception 'session.approve same-actor retry lost idempotency';
  end if;

  expected_revision:=revision_now;
  result:=public.dpp_api_ai_intake_manual_candidate_cas(
    v_session_id,'sku','9 SKUs',expected_revision,request_manual
  );
  retry:=public.dpp_api_ai_intake_manual_candidate_cas(
    v_session_id,'sku','9 SKUs',expected_revision,request_manual
  );
  if (retry->>'idempotent_retry')::boolean is not true then
    raise exception 'candidate.manual same-actor retry lost idempotency';
  end if;
end
$test$;

select 'AI_ACTOR_BOUND_SAME_ACTOR_RETRY_DB_PASS' as result;
