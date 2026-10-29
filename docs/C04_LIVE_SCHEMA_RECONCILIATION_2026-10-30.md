# C04 — Read-only Supabase migration reconciliation (2026-10-30)

**Status: PROVEN SCHEMA PRESENCE, NOT PROVEN MIGRATION PROVENANCE. DO NOT PROMOTE OR REAPPLY SQL.**

## Scope / evidence

- Database connection: canonical `frhletkiuupgksmgxoxc` (EU-west-1); Supabase SQL connector, strictly SELECT-only.
- CI evidence: [DPP Autopilot CI 40963710656](https://github.com/SoulFlameAdmin/DPPautopilot/actions/runs/40963710656) advances past R01/R02 and fails at `scripts/validate_migration_deployment_gate.py` (C04).
- Current committed `data/bound-supabase-migration-snapshot.json` fails to include four repo migration names. The live `supabase_migrations.schema_migrations` was queried for those four exact names and yielded **zero matches**. This does not establish that the corresponding SQL was never executed.

| Version in Git | Missing migration name in registry | Present live objects verified |
| --- | --- | --- |
| 20261007023500 | dpp_client_application_onboarding | dpp_client_applications; 2 indexes; client_application_submit, client_applications_mine |
| 20261007031500 | dpp_specific_registration_link_flow | dpp_registration_requests; 3 indexes; registration_request_create, registration_request_verify, registration_requests_mine |
| 20261007032500 | dpp_early_access_dashboard_details | client_applications_mine exists (could be the older function definition) |
| 20261007035000 | dpp_gmail_dashboard_link_sessions | dpp_early_access_sessions; 2 indexes |

All **3 tables, 7 indexes and 5 distinct functions** named above are present in the live `public` schema.

## Observed isolation / privileges (read-only)

All three tables — `dpp_client_applications`, `dpp_registration_requests`, `dpp_early_access_sessions` — have RLS enabled. Neither `anon` nor `authenticated` has direct `SELECT` or `INSERT` privilege for any of these three tables.

Live `SECURITY DEFINER` RPC grants from `has_function_privilege`:

| Function | anon EXECUTE | authenticated EXECUTE |
| --- | --- | --- |
| dpp_api_client_application_submit | NO | YES |
| dpp_api_client_applications_mine | NO | YES |
| dpp_api_registration_request_create | YES | NO |
| dpp_api_registration_request_verify | NO | YES |
| dpp_api_registration_requests_mine | NO | YES |

Those grants follow the stated surface separation in the Git migration files. **A grant match alone is not a cross-tenant security proof**. These security-definer RPCs require independent review of caller identity, search paths and input/rate limits.

Reference live function-definition MD5 values (Postgres `md5(pg_get_functiondef(oid))`; they are fingerprints of deployed text, NOT a comparison with the canonical repository):

- client_application_submit: `ab77f8b554e2b10e378a5f88499f5ef0`
- client_applications_mine: `524a1a313ff0286ad5dbb80f8ee5d399`
- registration_request_create: `4f7eaa2b7b21792001ab405ecdff8a8d`
- registration_request_verify: `ac25ef7d30a692badcc377c749476443`
- registration_requests_mine: `10b99085d0a715a33ad3b6dcc8db4a8f`

## Observed application data (aggregate only)

Live query showed 3 Early Access records with status `reviewing`, and zero rows in each of `dpp_registration_requests`, `dpp_client_applications` and `dpp_registry_submissions` at read time. No email addresses, personal data, registration tokens, or secret keys are included in this document.

## Next mandatory gate

1. Compare the **full deployed SQL definitions**, constraints, column types, grants, function `search_path`, and triggers against each repository migration and any later migrations overriding them. Do not confuse a same-name function with the same definition.
2. Investigate whether these objects were created by manual SQL, a branch, restore, alternate version or out-of-band process. Reconcile authoritative provenance with migration registry before claiming `applied`.
3. Capture a restorable, encrypted logical DB backup **and actual Storage object backup**, then prove isolated restore and a staging dry-run. Ensure RPO/RTO and access restrictions.
4. Obtain explicit owner approval for any production migration, label repair, state update or deployment; update bound snapshot **only after actual authoritative evidence**.
5. Rerun C04, full CI, isolated tenant/RPC negative tests and physical QR/Early Access E2E. Do not mark GREEN until these are completed.

**No database changes were made to produce this evidence.**
