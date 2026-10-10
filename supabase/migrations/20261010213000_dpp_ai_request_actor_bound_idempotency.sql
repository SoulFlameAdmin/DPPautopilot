-- PROPOSAL ONLY while Stage 1 C04 is RED.
-- A2 hardening: bind idempotency request IDs to the authenticated actor that created them.
-- This is additive Draft/CI work only. It does not authorize production SQL, merge, deploy,
-- canonical DPP generation or publication.

-- Keep the reviewed A2 CAS implementations intact behind non-public inner names.
alter function public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text)
  rename to dpp_api_ai_intake_turn_save_cas_unbound;
alter function public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid)
  rename to dpp_api_ai_intake_candidate_review_cas_unbound;
alter function public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid)
  rename to dpp_api_ai_intake_session_approve_cas_unbound;
alter function public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid)
  rename to dpp_api_ai_intake_manual_candidate_cas_unbound;

-- The renamed implementations must never remain callable by API roles, otherwise callers
-- could bypass the actor-bound wrapper below.
revoke all on function public.dpp_api_ai_intake_turn_save_cas_unbound(uuid,integer,uuid,text,jsonb,text,text)
  from public,anon,authenticated;
revoke all on function public.dpp_api_ai_intake_candidate_review_cas_unbound(uuid,uuid,boolean,integer,uuid)
  from public,anon,authenticated;
revoke all on function public.dpp_api_ai_intake_session_approve_cas_unbound(uuid,integer,uuid)
  from public,anon,authenticated;
revoke all on function public.dpp_api_ai_intake_manual_candidate_cas_unbound(uuid,text,text,integer,uuid)
  from public,anon,authenticated;

-- Serialize on the session before checking request ownership. This closes the race where
-- two writable users could both observe "no request" and the second later receive the
-- first user's cached response after waiting on the inner session lock.
create or replace function public.dpp_api_ai_intake_turn_save_cas(
  p_session_id uuid,
  p_expected_revision integer,
  p_request_id uuid,
  p_prompt text,
  p_candidates jsonb,
  p_model_id text default null,
  p_source_ref text default 'conversation:prompt'
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_created_by uuid;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  perform 1 from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id and status='active'
  for update;
  if not found then
    raise exception 'AI intake session is missing or not active' using errcode='DP404';
  end if;

  select r.created_by into v_created_by
  from public.dpp_ai_intake_requests r
  where r.organization_id=v_org and r.session_id=p_session_id and r.request_id=p_request_id;
  if found and v_created_by<>v_user then
    raise exception 'AI request id belongs to a different actor' using errcode='DP409';
  end if;

  return public.dpp_api_ai_intake_turn_save_cas_unbound(
    p_session_id,p_expected_revision,p_request_id,p_prompt,p_candidates,p_model_id,p_source_ref
  );
end
$fn$;

create or replace function public.dpp_api_ai_intake_candidate_review_cas(
  p_session_id uuid,
  p_candidate_id uuid,
  p_accept boolean,
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
  v_created_by uuid;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  perform 1 from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id and status='active'
  for update;
  if not found then
    raise exception 'AI intake session is missing or not active' using errcode='DP404';
  end if;

  select r.created_by into v_created_by
  from public.dpp_ai_intake_requests r
  where r.organization_id=v_org and r.session_id=p_session_id and r.request_id=p_request_id;
  if found and v_created_by<>v_user then
    raise exception 'AI request id belongs to a different actor' using errcode='DP409';
  end if;

  return public.dpp_api_ai_intake_candidate_review_cas_unbound(
    p_session_id,p_candidate_id,p_accept,p_expected_revision,p_request_id
  );
end
$fn$;

create or replace function public.dpp_api_ai_intake_session_approve_cas(
  p_session_id uuid,
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
  v_created_by uuid;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);
  v_user:=public.dpp_request_user_id();

  perform 1 from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id and status='active'
  for update;
  if not found then
    raise exception 'AI intake session is missing or not active' using errcode='DP404';
  end if;

  select r.created_by into v_created_by
  from public.dpp_ai_intake_requests r
  where r.organization_id=v_org and r.session_id=p_session_id and r.request_id=p_request_id;
  if found and v_created_by<>v_user then
    raise exception 'AI request id belongs to a different actor' using errcode='DP409';
  end if;

  return public.dpp_api_ai_intake_session_approve_cas_unbound(
    p_session_id,p_expected_revision,p_request_id
  );
end
$fn$;

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
  v_created_by uuid;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  perform 1 from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id and status='active'
  for update;
  if not found then
    raise exception 'AI intake session is missing or not active' using errcode='DP404';
  end if;

  select r.created_by into v_created_by
  from public.dpp_ai_intake_requests r
  where r.organization_id=v_org and r.session_id=p_session_id and r.request_id=p_request_id;
  if found and v_created_by<>v_user then
    raise exception 'AI request id belongs to a different actor' using errcode='DP409';
  end if;

  return public.dpp_api_ai_intake_manual_candidate_cas_unbound(
    p_session_id,p_field_key,p_value,p_expected_revision,p_request_id
  );
end
$fn$;

revoke all on function public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text)
  from public,anon;
revoke all on function public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid)
  from public,anon;
revoke all on function public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid)
  from public,anon;
revoke all on function public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid)
  from public,anon;

grant execute on function public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text)
  to authenticated;
grant execute on function public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid)
  to authenticated;
grant execute on function public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid)
  to authenticated;
grant execute on function public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid)
  to authenticated;

comment on function public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text) is
  'Actor-bound idempotent CAS wrapper. Same request_id may replay only for its original authenticated actor.';
comment on function public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid) is
  'Actor-bound candidate review CAS wrapper; cross-actor request_id replay fails closed.';
comment on function public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid) is
  'Actor-bound final approval CAS wrapper; cross-actor request_id replay fails closed.';
comment on function public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid) is
  'Actor-bound manual candidate CAS wrapper; cross-actor request_id replay fails closed.';
