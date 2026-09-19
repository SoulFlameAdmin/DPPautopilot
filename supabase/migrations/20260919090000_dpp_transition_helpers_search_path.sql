-- DPP security hardening: pin search_path on transition helper functions.
-- Logic and privileges are unchanged; this closes mutable search_path advisor warnings.

alter function public.dpp_lifecycle_transition_allowed(text,text)
  set search_path=public,pg_temp;

alter function public.dpp_registry_status_transition_allowed(text,text)
  set search_path=public,pg_temp;
