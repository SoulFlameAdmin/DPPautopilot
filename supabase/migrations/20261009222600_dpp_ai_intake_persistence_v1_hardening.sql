-- PROPOSAL ONLY while the Stage 1 C04 live migration gate is RED.
-- A2 persistence hardening: bind approvals to the exact tenant/session/field candidate
-- and keep snapshot approved_count deterministic without relying on object-length helpers.

alter table public.dpp_ai_intake_candidates
  add constraint dpp_ai_intake_candidates_approval_identity_uq
  unique (organization_id, session_id, field_key, id);

alter table public.dpp_ai_intake_approvals
  drop constraint if exists dpp_ai_intake_approvals_candidate_exact_fk;

alter table public.dpp_ai_intake_approvals
  add constraint dpp_ai_intake_approvals_candidate_exact_fk
  foreign key (organization_id, session_id, field_key, candidate_id)
  references public.dpp_ai_intake_candidates(organization_id, session_id, field_key, id)
  on delete cascade;

create or replace function public.dpp_api_ai_intake_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_session public.dpp_ai_intake_sessions%rowtype;
  v_messages jsonb;
  v_candidates jsonb;
  v_approvals jsonb;
  v_approved_answers jsonb;
  v_approved_count integer;
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select * into v_session
  from public.dpp_ai_intake_sessions s
  where s.id=p_session_id and s.organization_id=v_org;
  if not found then
    raise exception 'AI intake session not found' using errcode='DP404';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'actor',m.actor,'content',m.content,'source_ref',m.source_ref,
    'created_by',m.created_by,'created_at',m.created_at
  ) order by m.created_at,m.id),'[]'::jsonb)
  into v_messages
  from public.dpp_ai_intake_messages m
  where m.organization_id=v_org and m.session_id=p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'field_key',c.field_key,'value',c.candidate_value,
    'evidence',c.evidence,'source_type',c.source_type,'source_ref',c.source_ref,
    'model_id',c.model_id,'verification_state',c.verification_state,
    'reviewed_by',c.reviewed_by,'reviewed_at',c.reviewed_at,'updated_at',c.updated_at
  ) order by c.field_key),'[]'::jsonb)
  into v_candidates
  from public.dpp_ai_intake_candidates c
  where c.organization_id=v_org and c.session_id=p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'field_key',a.field_key,'candidate_id',a.candidate_id,'approved_value',a.approved_value,
    'approved_by',a.approved_by,'approved_at',a.approved_at
  ) order by a.field_key),'[]'::jsonb),
  coalesce(jsonb_object_agg(a.field_key,a.approved_value),'{}'::jsonb),
  count(*)::integer
  into v_approvals,v_approved_answers,v_approved_count
  from public.dpp_ai_intake_approvals a
  where a.organization_id=v_org and a.session_id=p_session_id;

  return jsonb_build_object(
    'session',jsonb_build_object(
      'id',v_session.id,'organization_id',v_session.organization_id,
      'created_by',v_session.created_by,'intake_kind',v_session.intake_kind,
      'status',v_session.status,'revision',v_session.revision,
      'created_at',v_session.created_at,'updated_at',v_session.updated_at
    ),
    'messages',v_messages,
    'candidates',v_candidates,
    'approvals',v_approvals,
    'approved_answers',v_approved_answers,
    'approved_count',v_approved_count,
    'canonical_answers_written',false,
    'can_publish',false
  );
end
$fn$;

revoke all on function public.dpp_api_ai_intake_snapshot(uuid) from public,anon;
grant execute on function public.dpp_api_ai_intake_snapshot(uuid) to authenticated;
