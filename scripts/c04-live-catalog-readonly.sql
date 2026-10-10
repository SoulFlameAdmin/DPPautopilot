-- C04 / SoulFlame DPP: READ-ONLY object and ACL inventory.
-- Safe on the connected database: pg_catalog metadata only, no user data, no writes.
-- This file is NOT a migration, migration gate override, or deploy instruction.
-- Pair results with Supabase list_migrations and an exact commit manifest.
--
-- Query 1: API function presence and role execution grants.
WITH targets(name) AS (
  VALUES
    ('dpp_api_organization_ensure'),
    ('dpp_api_technical_pilot_update_capacity'),
    ('dpp_api_manufacturer_onboarding_configure'),
    ('dpp_api_ai_intake_resume_or_create'),
    ('dpp_api_ai_intake_turn_save_cas'),
    ('dpp_api_ai_intake_candidate_review_cas'),
    ('dpp_api_ai_intake_session_approve_cas'),
    ('dpp_api_ai_intake_manual_candidate_cas'),
    ('dpp_api_ai_intake_turn_save_cas_unbound'),
    ('dpp_api_ai_intake_candidate_review_cas_unbound'),
    ('dpp_api_ai_intake_session_approve_cas_unbound'),
    ('dpp_api_ai_intake_manual_candidate_cas_unbound')
)
SELECT t.name, p.oid IS NOT NULL AS exists_in_db,
       pg_get_function_identity_arguments(p.oid) AS signature,
       p.prosecdef AS security_definer,
       CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_execute,
       CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_execute,
       CASE WHEN p.oid IS NOT NULL THEN md5(pg_get_functiondef(p.oid)) END AS definition_md5_diagnostic_only
FROM targets t
LEFT JOIN LATERAL (
  SELECT p.oid,p.prosecdef,p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname=t.name
) p ON true
ORDER BY t.name,signature;

-- Query 2: names of required A2 tables only; no access to their contents.
WITH targets(name) AS (
  VALUES
    ('dpp_ai_intake_sessions'),
    ('dpp_ai_intake_messages'),
    ('dpp_ai_intake_candidates'),
    ('dpp_ai_intake_approvals'),
    ('dpp_ai_intake_requests'),
    ('dpp_ai_intake_events')
)
SELECT t.name, to_regclass('public.'||t.name) IS NOT NULL AS exists_in_db
FROM targets t ORDER BY t.name;

-- Query 3: public RLS and direct table privileges, only if A2 tables exist.
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN (
    'dpp_ai_intake_sessions','dpp_ai_intake_messages','dpp_ai_intake_candidates',
    'dpp_ai_intake_approvals','dpp_ai_intake_requests','dpp_ai_intake_events'
  )
ORDER BY c.relname;

-- DO NOT UPDATE the bound snapshot based on this output alone.
-- C04 remains BLOCKED until migration registry, schema, backup/restore, C03,
-- exact SHA and release-time deployment evidence are independently verified.
