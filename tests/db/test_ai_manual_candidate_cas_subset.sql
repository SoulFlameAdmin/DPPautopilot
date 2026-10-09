-- A2.2 manual correction acceptance. CI wraps this file in BEGIN/ROLLBACK.
-- A manual edit must become a new user-sourced UNVERIFIED candidate, preserve the AI candidate,
-- require explicit conflict resolution + review, and never write canonical DPP/passport data.

do $test$
declare
  owner_id uuid := 'c6111111-1111-4111-8111-111111111111';
  viewer_id uuid := 'c6222222-2222-4222-8222-222222222222';
  org_id uuid;
  v_session_id uuid;
  v_revision integer;
  ai_candidate_id uuid;
  manual_candidate_id uuid;
  request_ai uuid := 'c7000000-0000-4000-8000-000000000001';
  request_manual uuid := 'c7000000-0000-4000-8000-000000000002';
  result jsonb;
  retry jsonb;
  snapshot jsonb;
  denied boolean;
begin
  insert into auth.users(id) values(owner_id),(viewer_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.dpp_api_organization_create('AI Manual Org','ai-manual-org');
  org_id:=(result->>'organization_id')::uuid;
  perform public.dpp_api_tenant_context_set(org_id);
  perform public.dpp_api_members_add(viewer_id,'viewer');

  result:=public.dpp_api_ai_intake_resume_or_create();
  v_session_id:=(result->>'id')::uuid;
  v_revision:=(result->>'revision')::integer;

  -- Seed one AI-extracted company candidate.
  result:=public.dpp_api_ai_intake_turn_save_cas(
    v_session_id,v_revision,request_ai,
    'The company is Acme AI Ltd.',
    jsonb_build_array(jsonb_build_object(
      'key','company','value','Acme AI Ltd','evidence','company is Acme AI Ltd'
    )),
    'openai/gpt-5.6-sol','conversation:manual:ai'
  );
  v_revision:=(result->>'revision')::integer;
  ai_candidate_id:=(result#>>'{candidate_ids,0,id}')::uuid;

  -- Human edit creates a distinct user-sourced candidate, still unverified.
  result:=public.dpp_api_ai_intake_manual_candidate_cas(
    v_session_id,'company','Acme Manual AD',v_revision,request_manual
  );
  if result->>'field_key'<>'company'
     or result->>'value'<>'Acme Manual AD'
     or result->>'verification_state'<>'unverified'
     or jsonb_array_length(result->'event_ids')<>2
     or (result->>'revision')::integer<>v_revision+2
     or (result->>'can_generate_battery_passport')::boolean is not false
     or (result->>'can_publish')::boolean is not false then
    raise exception 'Manual candidate result mismatch';
  end if;
  manual_candidate_id:=(result->>'candidate_id')::uuid;
  v_revision:=(result->>'revision')::integer;

  -- Exact retry is idempotent after revision advanced.
  retry:=public.dpp_api_ai_intake_manual_candidate_cas(
    v_session_id,'company','Acme Manual AD',v_revision-2,request_manual
  );
  if (retry->>'idempotent_retry')::boolean is not true
     or (retry->>'candidate_id')::uuid<>manual_candidate_id then
    raise exception 'Manual candidate exact retry was not idempotent';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_ai_intake_manual_candidate_cas(
      v_session_id,'company','Different value',v_revision-2,request_manual
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Manual request id accepted changed content'; end if;

  execute 'reset role';
  if (select count(*) from public.dpp_ai_intake_candidates
      where organization_id=org_id and session_id=v_session_id and field_key='company')<>2 then
    raise exception 'Manual correction overwrote the AI candidate';
  end if;
  if not exists(
    select 1 from public.dpp_ai_intake_candidates
    where id=manual_candidate_id and organization_id=org_id and session_id=v_session_id
      and candidate_value='Acme Manual AD' and source_type='user'
      and source_ref='manual:review:company' and source_id is not null
      and model_id is null and verification_state='unverified'
  ) then
    raise exception 'Manual candidate provenance mismatch';
  end if;

  -- Conflicting AI candidate prevents verifying the manual candidate.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  denied:=false;
  begin
    perform public.dpp_api_ai_intake_candidate_review_cas(
      v_session_id,manual_candidate_id,true,v_revision,gen_random_uuid()
    );
  exception when sqlstate 'DP409' then denied:=true;
  end;
  if not denied then raise exception 'Manual candidate bypassed conflict resolution'; end if;

  -- Reject the AI candidate, then explicitly verify the human correction.
  result:=public.dpp_api_ai_intake_candidate_review_cas(
    v_session_id,ai_candidate_id,false,v_revision,gen_random_uuid()
  );
  v_revision:=(result->>'revision')::integer;
  result:=public.dpp_api_ai_intake_candidate_review_cas(
    v_session_id,manual_candidate_id,true,v_revision,gen_random_uuid()
  );
  v_revision:=(result->>'revision')::integer;

  snapshot:=public.dpp_api_ai_intake_snapshot(v_session_id);
  if snapshot#>>'{approved_answers,company}'<>'Acme Manual AD'
     or (snapshot->>'approved_count')::integer<>1 then
    raise exception 'Verified manual correction was not resumable';
  end if;

  -- Viewer cannot create a manual correction.
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  denied:=false;
  begin
    perform public.dpp_api_ai_intake_manual_candidate_cas(
      v_session_id,'company','Viewer edit',v_revision,gen_random_uuid()
    );
  exception when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Viewer gained manual candidate write access'; end if;

  execute 'reset role';
  if exists(select 1 from public.dpp_manufacturer_onboarding_answers where organization_id=org_id)
     or exists(select 1 from public.dpp_battery_models where organization_id=org_id)
     or exists(select 1 from public.dpp_battery_items where organization_id=org_id)
     or exists(select 1 from public.dpp_passports where organization_id=org_id) then
    raise exception 'Manual candidate path produced canonical DPP side effects';
  end if;
end
$test$;

select 'AI_MANUAL_CANDIDATE_CAS_DB_PASS' as result;
