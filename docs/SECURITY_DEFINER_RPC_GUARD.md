# DPP SECURITY DEFINER / RPC Guard

Status: **hardening evidence**

This guard protects the Supabase/PostgREST database boundary against privilege-escalation regressions.

It fails when:

- a `public.dpp_*` `SECURITY DEFINER` function lacks the fixed `search_path=public, pg_temp`
- any DPP function is executable by `PUBLIC`
- any DPP function is executable by `anon`
- `authenticated` gains EXECUTE on a DPP function outside the explicit tenant/RBAC allowlist
- a required tenant/RBAC RPC loses its authenticated EXECUTE grant

The current authenticated allowlist is:

- `dpp_request_user_id()`
- `dpp_has_org_role(uuid,text[])`
- `dpp_set_active_organization(uuid)`
- `dpp_active_organization_id()`
- `dpp_require_active_role(text[])`

This strengthens M03/M05/R04/T02 security evidence without changing their dependency-driven master status.
