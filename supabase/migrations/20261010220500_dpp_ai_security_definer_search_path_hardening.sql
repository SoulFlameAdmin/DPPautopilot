-- PROPOSAL ONLY while Stage 1 C04 is RED.
-- A2 security hardening: keep every AI SECURITY DEFINER function on the repository-wide
-- fixed search_path invariant. Extension calls that are required by these functions are
-- already schema-qualified (for example extensions.digest), so the extensions schema
-- does not need to participate in name resolution.
--
-- This migration is additive Draft/CI work only. It does not authorize production SQL,
-- merge, deploy, canonical DPP generation or publication.

alter function public.dpp_ai_sha256_json(jsonb)
  set search_path = public, pg_temp;

alter function public.dpp_api_ai_intake_turn_save_cas_unbound(uuid,integer,uuid,text,jsonb,text,text)
  set search_path = public, pg_temp;
alter function public.dpp_api_ai_intake_candidate_review_cas_unbound(uuid,uuid,boolean,integer,uuid)
  set search_path = public, pg_temp;
alter function public.dpp_api_ai_intake_session_approve_cas_unbound(uuid,integer,uuid)
  set search_path = public, pg_temp;
alter function public.dpp_api_ai_intake_manual_candidate_cas_unbound(uuid,text,text,integer,uuid)
  set search_path = public, pg_temp;

alter function public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text)
  set search_path = public, pg_temp;
alter function public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid)
  set search_path = public, pg_temp;
alter function public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid)
  set search_path = public, pg_temp;
alter function public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid)
  set search_path = public, pg_temp;

comment on function public.dpp_ai_sha256_json(jsonb) is
  'AI intake canonical JSON SHA-256 helper. SECURITY DEFINER with fixed public, pg_temp search_path; digest remains schema-qualified.';
