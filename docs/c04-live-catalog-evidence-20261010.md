# C04 independent live-object reconciliation — 10 October 2026

**Evidence type:** read-only, live Supabase catalog inspection on bound project `frhletkiuupgksmgxoxc`. This is NOT a migration deployment, release certification, backup or approval.

**Source:** Connected Supabase `list_migrations` and three read-only catalog queries from `scripts/c04-live-catalog-readonly.sql`. Exact parent PR #324 head at analysis: `e97386d8dd6cdd59c4d35c0c7355ccd27e0cb034`.

## What we proved

- **Nine proposed repo migration names are absent from the LIVE migration registry**, not just the older `data/bound-supabase-migration-snapshot.json` (observed October 7). The live connector lists 468 total migration records; the last name shown is `dpp_technical_pilot_capacity_update`.
- **No current public `dpp_api_organization_ensure` function** in the live catalog.
- **No A2 intake tables**: sessions, messages, candidates, approvals, requests and events are all absent.
- **No proposed A2 CAS/public or `*_unbound` functions** currently exist in the live catalog. Therefore the isolated CI PASS from PR #324 does not establish a live A2 service.
- **Existing capacity update RPC is `SECURITY DEFINER` and has `anon EXECUTE = true`** in live `pg_catalog`. The current function definition calls `dpp_require_active_role(['owner','admin','editor'])` before changes; this inspection does **not** establish an unauthorized-write exploit. The proposed `dpp_capacity_update_anon_execute_revoke` migration has not been registered and its intended privilege hardening remains unverified live.
- **`dpp_api_manufacturer_onboarding_configure` exists**, with anon EXECUTE false and authenticated EXECUTE true. Presence alone **does not prove** that the later `dpp_onboarding_truthful_progress` migration's expected function body and effects have been applied.

## Registry reconciliation

| Migration | Live registry | Related live object/ACL |
|---|---|---|
| `dpp_organization_ensure` | ABSENT | RPC absent |
| `dpp_capacity_update_anon_execute_revoke` | ABSENT | Existing capacity RPC still grants anon EXECUTE |
| `dpp_onboarding_truthful_progress` | ABSENT | Configure RPC exists; compare exact implementation before classification |
| `dpp_ai_intake_persistence_v1` | ABSENT | Six A2 tables absent |
| `dpp_ai_intake_persistence_v1_hardening` | ABSENT | Dependent A2 tables/RPCs absent |
| `dpp_ai_conversation_cas_v2` | ABSENT | CAS functions absent |
| `dpp_ai_candidate_conflict_constraint_fix` | ABSENT | A2 candidates table absent |
| `dpp_ai_manual_candidate_cas_v1` | ABSENT | Manual CAS RPC absent |
| `dpp_ai_request_actor_bound_idempotency` | ABSENT | Actor-bound public and inner CAS RPCs absent |

**Important:** The October 7 snapshot is stale, and a missing migration registry name by itself does not prove the associated objects are missing. Here we independently inspected the *live* object catalog and found specific absent functions/tables, plus one unwanted live anon grant. We have NOT applied any DDL, DML, grants or production migrations.

## Immediate decision and next gates

1. Keep **C04 = RED** and `default: deny`. Do not change snapshots or release status to mimic GREEN.
2. Review the proposed capacity RPC privilege-revocation migration as a **security remediation proposal**. Obtain explicit owner approval before applying it in the production database; do not disable the internal authorization guard.
3. Reconcile exact migration checksums against any out-of-band deployments. Inspect dependency order and run pending migrations on a **fresh isolated Postgres 17 environment** (PR #323 is a useful initial non-release CI smoke test).
4. Obtain verified encrypted database backup **and separate private Storage object backup**, then execute and document an isolated restore and rollback rehearsal.
5. Re-run tenant-cross, reviewer-permission, CAS replay, RLS/grants, onboarding truthfulness, and QR/lifecycle negative tests in the isolated target. Capture exact SHA and test logs.
6. Require explicit human authorization before *any* production SQL, role changes, snapshot refresh, merge or deploy, then gather release-time evidence and resolve C03/C04 normally.

This change is a **read-only audit aid**, not a promise of production readiness.
