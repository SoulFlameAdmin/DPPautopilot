-- PROPOSAL ONLY while Stage 1 C04 is RED.
-- A2.2: Manual correction path compatible with Worker A semantics.
-- A human edit creates a NEW unverified user-sourced candidate and never mutates/verifies
-- an AI candidate in place. Verification remains a separate candidate.review CAS event.

alter table public.dpp_ai_intake_requests
  drop constraint if exists dpp_ai_intake_requests_request_kind_check;

alter table public.dpp_ai_intake_requests
  add constraint dpp_ai_intake_requests_request_kind_check check (
    request_kind in ('turn.extract','candidate.manual','candidate.review','session.approve','session.mode')
  );

create or replace function public.dpp_api_ai_intake_manual_candidate_cas(
  p_session_id uuid,
  p_field_key text,
  p_value text,
  p_expected_revision integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_session public.dpp_ai_intake_sessions%rowtype;
  v_existing public.dpp_ai_intake_requests%rowtype;
  v_request_payload jsonb;
  v_request_hash text;
  v_message_id uuid:=gen_random_uuid();
  v_candidate_id uuid:=gen_random_uuid();
  v_message_event_id uuid:=gen_random_uuid();
  v_candidate_event_id uuid:=gen_random_uuid();
  v_event_time timestamptz:=clock_timestamp();
  v_message_payload jsonb;
  v_candidate_payload jsonb;
  v_clean_value text;
  v_response jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Manual candidate CAS request id and expected revision are required' using errcode='DP501';
  end if;
  if p_field_key not in ('country','company','products','sku','annualVolume','users','systems','automation') then
    raise exception 'Manual candidate field key is invalid' using errcode='DP501';
  end if;
  v_clean_value:=btrim(coalesce(p_value,''));
  if char_length(v_clean_value) not between 1 and 5000 then
    raise exception 'Manual candidate value is invalid' using errcode='DP501';
  end if;

  v_request_payload:=jsonb_build_object('field_key',p_field_key,'value',v_clean_value);
  v_request_hash:=public.dpp_ai_sha256_json(v_request_payload);

  select * into v_session
  from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id and status='active'
  for update;
  if not found then
    raise exception 'AI intake session is missing or not active' using errcode='DP404';
  end if;

  select * into v_existing
  from public.dpp_ai_intake_requests
  where organization_id=v_org and session_id=p_session_id and request_id=p_request_id;
  if found then
    if v_existing.request_kind='candidate.manual'
       and v_existing.created_by=v_user
       and v_existing.expected_revision=p_expected_revision
       and v_existing.request_sha256=v_request_hash then
      return v_existing.response_json || jsonb_build_object('idempotent_retry',true);
    end if;
    raise exception 'AI request id was reused with different content' using errcode='DP409';
  end if;

  if v_session.revision<>p_expected_revision then
    raise exception 'AI intake revision conflict' using errcode='DP409';
  end if;

  insert into public.dpp_ai_intake_requests(
    organization_id,session_id,request_id,request_kind,expected_revision,request_sha256,
    first_revision,final_revision,response_json,created_by
  ) values (
    v_org,p_session_id,p_request_id,'candidate.manual',p_expected_revision,v_request_hash,
    p_expected_revision+1,p_expected_revision+2,'{}'::jsonb,v_user
  );

  -- A manual correction gets its own stable user message source.
  insert into public.dpp_ai_intake_messages(
    id,organization_id,session_id,actor,content,source_ref,created_by,created_at
  ) values (
    v_message_id,v_org,p_session_id,'user',v_clean_value,
    'manual:review:'||p_field_key,v_user,v_event_time
  );

  v_message_payload:=jsonb_build_object('message',jsonb_build_object(
    'id',v_message_id,'role','user','text',v_clean_value,'manual_field_key',p_field_key
  ));
  insert into public.dpp_ai_intake_events(
    event_id,organization_id,session_id,request_id,sequence_no,expected_revision,revision,
    kind,actor_id,payload,payload_sha256,occurred_at
  ) values (
    v_message_event_id,v_org,p_session_id,p_request_id,1,p_expected_revision,p_expected_revision+1,
    'message.add',v_user,v_message_payload,public.dpp_ai_sha256_json(v_message_payload),v_event_time
  );

  -- A changed field invalidates its field approval and any final session approval.
  delete from public.dpp_ai_intake_approvals
  where organization_id=v_org and session_id=p_session_id and field_key=p_field_key;

  insert into public.dpp_ai_intake_candidates(
    id,organization_id,session_id,field_key,candidate_value,evidence,
    source_type,source_ref,source_id,anchor,model_id,verification_state,
    reviewed_by,reviewed_at,created_at,updated_at
  ) values (
    v_candidate_id,v_org,p_session_id,p_field_key,v_clean_value,v_clean_value,
    'user','manual:review:'||p_field_key,v_message_id,null,null,'unverified',
    null,null,v_event_time,v_event_time
  );

  v_candidate_payload:=jsonb_build_object('candidate',jsonb_build_object(
    'id',v_candidate_id,'field_key',p_field_key,'value',v_clean_value,
    'source_type','user','source_id',v_message_id,'manual',true
  ));
  insert into public.dpp_ai_intake_events(
    event_id,organization_id,session_id,request_id,sequence_no,expected_revision,revision,
    kind,actor_id,payload,payload_sha256,occurred_at
  ) values (
    v_candidate_event_id,v_org,p_session_id,p_request_id,2,p_expected_revision+1,p_expected_revision+2,
    'candidate.propose',v_user,v_candidate_payload,public.dpp_ai_sha256_json(v_candidate_payload),v_event_time
  );

  update public.dpp_ai_intake_sessions
  set revision=p_expected_revision+2,updated_at=v_event_time,
      approved_by=null,approved_at=null,approved_revision=null
  where organization_id=v_org and id=p_session_id;

  v_response:=jsonb_build_object(
    'session_id',p_session_id,'request_id',p_request_id,
    'expected_revision',p_expected_revision,'revision',p_expected_revision+2,
    'message_id',v_message_id,'candidate_id',v_candidate_id,
    'event_ids',jsonb_build_array(v_message_event_id,v_candidate_event_id),
    'field_key',p_field_key,'value',v_clean_value,'verification_state','unverified',
    'canonical_answers_written',false,'can_generate_battery_passport',false,'can_publish',false,
    'idempotent_retry',false
  );

  update public.dpp_ai_intake_requests
  set response_json=v_response
  where organization_id=v_org and session_id=p_session_id and request_id=p_request_id;

  return v_response;
end
$fn$;

revoke all on function public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid) from public,anon;
grant execute on function public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid) to authenticated;

comment on function public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid) is
  'Creates a new unverified user-sourced manual candidate with server-issued provenance and atomic revision CAS. Never verifies, writes canonical DPP data, generates a passport, or publishes.';
