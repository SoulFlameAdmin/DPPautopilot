-- A2 actor-bound idempotency acceptance. CI wraps this file in BEGIN/ROLLBACK.
-- Proves that exact request_id replay is allowed only to the actor that created it,
-- across turn, candidate review, final approval and manual correction CAS operations.

do $test$
declare
  owner_id uuid := 'c6111111-1111-4111-8111-111111111111';
  editor_id uuid := 'c6222222-2222-4222-8222-222222222222';
  admin_id uuid := 'c6333333-3333-4333-8333-333333333333';
  org_id uuid;
  v_session_id uuid;
  initial_revision integer;
  revision_now integer;
  review_expected integer;
  approve_expected integer;
  manual_expected integer;
  request_turn uuid := 'c7000000-0000-4000-8000-000000000001';
  request_review uuid := 'c7000000-0000-4000-8000-000000000002';
  request_approve uuid := 'c7000000-0000-4000-8000-000000000003';
  request_manual uuid := 'c7000000-0000-4000-8000-000000000004';
  result jsonb;
  retry jsonb;
  country_candidate uuid;
  candidate record;
  denied boolean;
begin
  insert into auth.users(id) values(owner_id),(editor_id),(admin_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);

  result:=public.dpp_api_organization_create('AI Actor Bound Org','ai-actor-bound-org');
  org_id:=(result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_id);
  perform public.dpp_api_members_add(editor_id,'editor');
  perform public.dpp_api_members_add(admin_id,'admin');

  result:=public.dpp_api_ai_intake_resume_or_create();
  v_session_id:=(result->>'id')::uuid;
  initial_revision:=(result->>'revision')::integer;

  result:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,initial_revision,request_turn,
    'Actor Bound Ltd is in Bulgaria. We make LMT packs, 8 SKUs, 12000 units/year. Compliance and engineering use ERP + BMS. Automate DPP onboarding.',
    jsonb_build_array(
      jsonb_build_object('key','country','value','Bulgaria','evidence','in Bulgaria'),
      jsonb_build_object('key','company','value','Actor Bound Ltd','evidence','Actor Bound Ltd'),
      jsonb_build_object('key','products','value','LMT packs','evidence','make LMT packs'),
      jsonb_build_object('key','sku','value','8 SKUs','evidence','8 SKUs'),
      jsonb_build_object('key','annualVolume','value','12000 units/year','evidence','12000 units/year'),
      jsonb_build_object('key','users','value','Compliance and engineering','evidence','Compliance and engineering'),
      jsonb_build_object('key','systems','value','ERP + BMS','evidence','ERP + BMS'),
      jsonb_build_object('key','automation','value','Automate DPP onboarding','evidence','Automate DPP onboarding')
    ),
    'openai/gpt-5.6-sol','conversation:actor-bound:1'
  );
  revision_now:=(result->>'revision')::integer;

  -- Same actor keeps legitimate idempotent retry behavior.
  retry:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,initial_revision,request_turn,
    'Actor Bound Ltd is in Bulgaria. We make LMT packs, 8 SKUs, 12000 units/year. Compliance and engineering use ERP + BMS. Automate DPP onboarding.',
    jsonb_build_array(
      jsonb_build_object('key','country','value','Bulgaria','evidence','in Bulgaria'),
      jsonb_build_object('key','company','value','Actor Bound Ltd','evidence','Actor Bound Ltd'),
      jsonb_build_object('key','products','value','LMT packs','evidence','make LMT packs'),
      jsonb_build_object('key','sku','value','8 SKUs','evidence','8 SKUs'),
      jsonb_build_object('key','annualVolume','value','12000 units/year','evidence','12000 units/year'),
      jsonb_build_object('key','users','value','Compliance and engineering','evidence','Compliance and engineering'),
      jsonb_build_object('key','systems','value','ERP + BMS','evidence','ERP + BMS'),
      jsonb_build_object('key','automation','value','Automate DPP onboarding','evidence','Automate DPP onboarding')
    ),
    'openai/gpt-5.6-sol','conversation:actor-bound:1'
  );
  if (retry->>'idempotent_retry')::boolean is not true then
    raise exception 'Original actor lost legitimate turn idempotency';
  end if;

  -- Another writable member must not replay the owner's cached turn response.
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  denied:=false;
  begin
    perform public.dpp_api_ai_intake_turn_save_cas(
      v_session_id,initial_revision,request_turn,
      'Actor Bound Ltd is in Bulgaria. We make LMT packs, 8 SKUs, 12000 units/year. Compliance and engineering use ERP + BMS. Automate DPP onboarding.',
      jsonb_build_array(
        jsonb_build_object('key','country','value','Bulgaria','evidence','in Bulgaria'),
        jsonb_build_object('key','company','value','Actor Bound Ltd','evidence','Actor Bound Ltd'),
        jsonb_build_object('key','products','value','LMT packs','evidence','make LMT packs'),
        jsonb_build_object('key','sku','value','8 SKUs','evidence','8 SKUs'),
        jsonb_build_object('key','annualVolume','value','12000 units/year','evidence','12000 units/year'),
        jsonb_build_object('key','users','value','Compliance and engineering','evidence','Compliance and engineering'),
        jsonb_build_object('key','systems','value','ERP + BMS','evidence','ERP + BMS'),
        jsonb_build_object('key','automation','value','Automate DPP onboarding','evidence','Automate DPP onboarding')
      ),
      'openai/gpt-5.6-sol','conversation:actor-bound:1'
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Editor replayed owner turn request_id'; end if;

  -- Owner reviews one candidate under a stable request_id.
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  execute 'reset role';
  select id into country_candidate
  from public.dpp_ai_intake_candidates
  where organization_id=org_id and session_id=v_session_id and field_key='country'
  order by created_at,id limit 1;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);

  review_expected:=revision_now;
  result:=public.dpp_api_ai_intake_candidate_review_cas(
    v_session_id,country_candidate,true,review_expected,request_review
  );
  revision_now:=(result->>'revision')::integer;

  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  denied:=false;
  begin
    perform public.dpp_api_ai_intake_candidate_review_cas(
      v_session_id,country_candidate,true,review_expected,request_review
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Editor replayed owner candidate-review request_id'; end if;

  -- Owner verifies the other seven original candidates.
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

  -- Final approval is also actor-bound, even between two users who both have approval authority.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  approve_expected:=revision_now;
  result:=public.dpp_api_ai_intake_session_approve_cas(
    v_session_id,approve_expected,request_approve
  );
  revision_now:=(result->>'revision')::integer;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  denied:=false;
  begin
    perform public.dpp_api_ai_intake_session_approve_cas(
      v_session_id,approve_expected,request_approve
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Admin replayed owner approval request_id'; end if;

  -- Manual correction has the same actor-bound rule.
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  manual_expected:=revision_now;
  result:=public.dpp_api_ai_intake_manual_candidate_cas(
    v_session_id,'sku','9 SKUs',manual_expected,request_manual
  );
  revision_now:=(result->>'revision')::integer;

  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  denied:=false;
  begin
    perform public.dpp_api_ai_intake_manual_candidate_cas(
      v_session_id,'sku','9 SKUs',manual_expected,request_manual
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Editor replayed owner manual-candidate request_id'; end if;

  -- Inner implementations are not an API escape hatch.
  execute 'reset role';
  if has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_turn_save_cas_unbound(uuid,integer,uuid,text,jsonb,text,text)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_candidate_review_cas_unbound(uuid,uuid,boolean,integer,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_session_approve_cas_unbound(uuid,integer,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_manual_candidate_cas_unbound(uuid,text,text,integer,uuid)','EXECUTE') then
    raise exception 'Authenticated can bypass actor-bound CAS wrappers';
  end if;
end
$test$;

select 'AI_ACTOR_BOUND_IDEMPOTENCY_DB_PASS' as result;
