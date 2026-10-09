-- AI-first A2 persistence acceptance. CI wraps this file in BEGIN/ROLLBACK.
-- Proves resumability, tenant isolation, explicit human approval, and no canonical side effects.
-- Direct table assertions intentionally run as the PostgreSQL test owner because authenticated
-- has no direct table grants; product behavior is exercised only through checked RPCs.

do $test$
declare
  owner_id uuid := 'a6111111-1111-4111-8111-111111111111';
  viewer_id uuid := 'a6222222-2222-4222-8222-222222222222';
  outsider_id uuid := 'a6333333-3333-4333-8333-333333333333';
  org_a uuid;
  org_b uuid;
  session_a uuid;
  result jsonb;
  snapshot jsonb;
  denied boolean;
begin
  insert into auth.users(id) values(owner_id),(viewer_id),(outsider_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.dpp_api_organization_create('AI Intake A','ai-intake-a');
  org_a:=(result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_a);
  perform public.dpp_api_members_add(viewer_id,'viewer');

  result:=public.dpp_api_ai_intake_resume_or_create();
  session_a:=(result->>'id')::uuid;
  if (result->>'organization_id')::uuid<>org_a
     or (result->>'created_by')::uuid<>owner_id
     or result->>'status'<>'active' then
    raise exception 'AI intake session creation mismatch';
  end if;

  -- Resume must return the same active session for the same user/tenant/kind.
  result:=public.dpp_api_ai_intake_resume_or_create();
  if (result->>'id')::uuid<>session_a then
    raise exception 'AI intake resume created a duplicate active session';
  end if;

  result:=public.dpp_api_ai_intake_turn_save(
    session_a,
    'We are Battery A in Bulgaria. We make LMT battery packs and use ERP + BMS.',
    jsonb_build_array(
      jsonb_build_object('key','country','value','Bulgaria','evidence','in Bulgaria','source_type','user','source_ref','conversation:prompt:1'),
      jsonb_build_object('key','company','value','Battery A','evidence','We are Battery A','source_type','user','source_ref','conversation:prompt:1'),
      jsonb_build_object('key','products','value','LMT battery packs','evidence','make LMT battery packs','source_type','user','source_ref','conversation:prompt:1'),
      jsonb_build_object('key','systems','value','ERP + BMS','evidence','use ERP + BMS','source_type','user','source_ref','conversation:prompt:1')
    ),
    'openai/gpt-5.6-sol',
    'conversation:prompt:1'
  );
  if (result->>'saved_candidates')::integer<>4
     or result->>'verification_state'<>'unverified'
     or (result->>'canonical_answers_written')::boolean is not false
     or (result->>'can_publish')::boolean is not false then
    raise exception 'AI turn save safety result mismatch';
  end if;

  snapshot:=public.dpp_api_ai_intake_snapshot(session_a);
  if jsonb_array_length(snapshot->'messages')<>1
     or jsonb_array_length(snapshot->'candidates')<>4
     or (snapshot->>'approved_count')::integer<>0
     or snapshot->'approved_answers'<>'{}'::jsonb then
    raise exception 'Initial AI intake snapshot mismatch';
  end if;

  -- White-box assertion: direct grants are deliberately revoked from authenticated.
  execute 'reset role';
  if exists(
    select 1 from public.dpp_ai_intake_candidates
    where organization_id=org_a and session_id=session_a and verification_state<>'unverified'
  ) then
    raise exception 'AI candidate became verified without human review';
  end if;

  -- Return to the real application role for all public RPC behavior.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);

  -- Explicit approval is separate from the original candidate and can contain a human edit.
  result:=public.dpp_api_ai_intake_candidate_review(session_a,'company','Battery A Ltd',true);
  if result->>'verification_state'<>'accepted'
     or result->>'approved_value'<>'Battery A Ltd'
     or (result->>'canonical_answers_written')::boolean is not false
     or (result->>'can_publish')::boolean is not false then
    raise exception 'Human approval result mismatch';
  end if;

  snapshot:=public.dpp_api_ai_intake_snapshot(session_a);
  if (snapshot->>'approved_count')::integer<>1
     or snapshot#>>'{approved_answers,company}'<>'Battery A Ltd' then
    raise exception 'Approved answer was not resumable';
  end if;

  -- White-box provenance/approval separation checks run as test owner only.
  execute 'reset role';
  if not exists(
    select 1
    from public.dpp_ai_intake_candidates c
    where c.organization_id=org_a and c.session_id=session_a
      and c.field_key='company' and c.candidate_value='Battery A'
      and c.verification_state='accepted'
  ) then
    raise exception 'Original AI candidate/provenance was not preserved';
  end if;

  if not exists(
    select 1
    from public.dpp_ai_intake_approvals a
    where a.organization_id=org_a and a.session_id=session_a
      and a.field_key='company' and a.approved_value='Battery A Ltd'
      and a.approved_by=owner_id
  ) then
    raise exception 'Human approval was not stored separately';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);

  -- Re-running the model for a field invalidates its previous approval and returns it to unverified.
  perform public.dpp_api_ai_intake_turn_save(
    session_a,
    'The legal company name is Battery A AD.',
    jsonb_build_array(
      jsonb_build_object('key','company','value','Battery A AD','evidence','legal company name is Battery A AD','source_type','user','source_ref','conversation:prompt:2')
    ),
    'openai/gpt-5.6-sol',
    'conversation:prompt:2'
  );
  snapshot:=public.dpp_api_ai_intake_snapshot(session_a);
  if (snapshot->>'approved_count')::integer<>0 then
    raise exception 'Stale approval survived a changed AI candidate';
  end if;

  execute 'reset role';
  if not exists(
    select 1 from public.dpp_ai_intake_candidates
    where organization_id=org_a and session_id=session_a and field_key='company'
      and candidate_value='Battery A AD' and verification_state='unverified'
      and reviewed_by is null and reviewed_at is null
  ) then
    raise exception 'Updated AI candidate was not reset to unverified';
  end if;

  -- Viewer can read snapshot but cannot create/write/review.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  perform public.dpp_api_tenant_context_set(org_a);
  snapshot:=public.dpp_api_ai_intake_snapshot(session_a);
  if snapshot#>>'{session,id}'<>session_a::text then
    raise exception 'Viewer could not read tenant AI intake snapshot';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_resume_or_create();
  exception when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Viewer gained AI intake write access'; end if;

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_candidate_review(session_a,'company','Unauthorized',true);
  exception when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Viewer gained AI candidate review access'; end if;

  -- Separate tenant must not see tenant A session.
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  result:=public.dpp_api_organization_create('AI Intake B','ai-intake-b');
  org_b:=(result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_b);

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_snapshot(session_a);
  exception when sqlstate 'DP404' then denied:=true;
  end;
  if not denied then raise exception 'AI intake snapshot leaked across tenants'; end if;

  -- No A2 operation may write canonical onboarding, products, items, passports, or publish state.
  execute 'reset role';
  if exists(select 1 from public.dpp_manufacturer_onboarding_answers where organization_id=org_a)
     or exists(select 1 from public.dpp_battery_models where organization_id=org_a)
     or exists(select 1 from public.dpp_battery_items where organization_id=org_a)
     or exists(select 1 from public.dpp_passports where organization_id=org_a) then
    raise exception 'AI A2 persistence produced a canonical DPP side effect';
  end if;
end
$test$;

select 'AI_INTAKE_PERSISTENCE_DB_PASS' as result;
