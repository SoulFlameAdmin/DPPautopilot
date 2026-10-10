# C04 migration change plan — NO APPLY

Date: 2026-10-10
Status: Draft / planning evidence only
Bound project: `frhletkiuupgksmgxoxc`
Base security head: `af11925fbf15eb919dac95d3841ccd2a2be77a31`

## Safety boundary

This document is a migration change plan required by Issue #318. It does **not** authorize production SQL, snapshot regeneration, merge, deploy, release, or physical QR acceptance. C04 must remain fail-closed until authoritative live migration evidence, real DB + Storage backup evidence, isolated restore evidence, live-schema verification, and explicit owner approval exist.

Never edit `data/bound-supabase-migration-snapshot.json` to claim an unapplied migration is applied, and never weaken `scripts/validate_migration_deployment_gate.py`.

## Current evidence

- PR #330 exact-stack merge snapshot `a59d650f2a9b687194949682049b525681752648` combines QA head `06f5c4e20c12c7bd790532a5fbbf8655942423cb` with security base `af11925fbf15eb919dac95d3841ccd2a2be77a31`.
- `DB Regression Independent (NON RELEASE)` run #5 is GREEN for full migration replay, A2 actor-bound contracts, DB integration/idempotency/audit, tenant/RLS/RBAC/RPC security, product/provisioning/evidence/retention/shared-rate-limit flows, and an isolated synthetic `pg_dump`/`pg_restore` drill.
- Standard Stage 4, Stage 5, Step 18, Step 19, Step 20 and AI-first contract workflows are GREEN on the current QA stack.
- Main CI remains RED at C04, by design.
- Independent PR #325 read-only live audit found the prior nine proposed migration names absent from the live registry and found unwanted `anon EXECUTE` on the technical-pilot capacity RPC. The new #331 search-path hardening migration makes the current repo-side post-snapshot set ten migrations.
- A direct read-only `list_migrations` attempt from the current QA connection returned permission denied. No SQL workaround was attempted.

The synthetic restore in #330 is **not** real bound-project DB/Storage recovery evidence.

## Required preconditions before any production apply

All items are mandatory:

1. Fresh authoritative read-only `list_migrations` output for `frhletkiuupgksmgxoxc`, timestamped and retained as evidence.
2. Read-only live catalog reconciliation for every object affected below: exact function signatures/bodies, `SECURITY DEFINER` flags, `proconfig/search_path`, table/constraint existence, RLS state, policies and role grants.
3. Exact candidate Git commit SHA and migration file checksums frozen before change.
4. Restorable encrypted logical DB backup covering schema + data + required role metadata, with checksum, byte size, creation timestamp and protected storage location recorded without exposing secrets.
5. Separate backup of actual Supabase Storage object bytes plus bucket/object inventory, object counts/sizes and integrity evidence.
6. Successful isolated restore of both DB and Storage backup artifacts. Verify schema, row-count/sample invariants, Storage object counts/checksums and access controls.
7. Maintenance/change window approved. Do not claim zero downtime: several migrations alter tables/constraints/functions and may acquire locks.
8. Explicit owner approval for production SQL after review of this evidence. Snapshot regeneration is a later, separate evidence step after authoritative application is confirmed.

## Canonical dependency order

Apply only in repository timestamp order. Do not cherry-pick later AI migrations ahead of their prerequisites.

| Order | Migration | Purpose | Critical pre-apply check | Rollback boundary |
|---|---|---|---|---|
| 1 | `20261008024500_dpp_organization_ensure.sql` | Adds idempotent same-user organization ensure RPC with advisory serialization. | Confirm exact RPC is absent or reconcile any out-of-band definition; verify dependencies `dpp_request_user_id`, `dpp_active_organization_id`, membership/org tables and `dpp_api_organization_create`. | If newly created and unused, drop exact function after approval; otherwise restore pre-change DB backup / forward-fix. |
| 2 | `20261008131700_dpp_capacity_update_anon_execute_revoke.sql` | Removes unwanted anonymous EXECUTE and preserves authenticated EXECUTE. | Exact capacity RPC signature must exist; capture current ACL. | Do **not** automatically restore anonymous EXECUTE. Prefer forward-fix or feature disablement. Any ACL rollback requires explicit security approval. |
| 3 | `20261008131800_dpp_onboarding_truthful_progress.sql` | Replaces onboarding configure response so only company is `done`; physical/product/DPP/QR/ready remain `pending`. | Capture exact live `pg_get_functiondef`, owner and ACL before replace; confirm referenced onboarding/config tables exist. | Reapply captured pre-change function definition only under explicit approval, or restore backup. |
| 4 | `20261009222500_dpp_ai_intake_persistence_v1.sql` | Creates tenant-scoped AI intake persistence tables/RLS and initial RPC surface. | Verify no conflicting out-of-band AI tables/functions; verify auth/users/org role helpers and extensions required by canonical SQL. | Because new persistent data can be created, do not casually `DROP` after use. Prefer tested backup restore or forward-fix. Destructive rollback only if confirmed empty and separately approved. |
| 5 | `20261009222600_dpp_ai_intake_persistence_v1_hardening.sql` | Adds exact candidate identity uniqueness/FK and deterministic snapshot behavior. | Migration #4 must exist exactly; preflight existing duplicate/conflicting rows before constraint creation. | Immediate empty-system rollback may drop the new FK/constraint and restore prior snapshot function; otherwise restore backup/forward-fix. |
| 6 | `20261009222700_dpp_ai_conversation_cas_v2.sql` | Adds request/event persistence, CAS revisions, multi-candidate support and CAS RPCs. | #4/#5 must be present; inspect legacy unique constraint, candidate/session columns and extension-qualified digest dependency. | High-risk downgrade once CAS/events are written. Prefer backup restore/forward-fix; do not recreate one-candidate uniqueness if new conflicting rows exist. |
| 7 | `20261009222800_dpp_ai_candidate_conflict_constraint_fix.sql` | Structurally removes legacy one-candidate-per-field unique constraint. | #6 candidate schema must exist; confirm only the intended 3-column unique is selected. | Recreate old uniqueness only if data proves uniqueness; otherwise backup restore/forward-fix. |
| 8 | `20261009222900_dpp_ai_manual_candidate_cas_v1.sql` | Adds `candidate.manual` request kind and manual-candidate CAS RPC. | #6 request/event tables and hash helper must exist; verify request-kind constraint shape. | If no `candidate.manual` rows exist, revert constraint + function under approval; otherwise backup restore/forward-fix. |
| 9 | `20261010213000_dpp_ai_request_actor_bound_idempotency.sql` | Renames reviewed CAS implementations to non-public `*_unbound`, revokes API access, and adds actor-bound wrappers. | All four CAS functions from prior migrations must exist with exact signatures; capture grants and function definitions. | Security downgrade is not an automatic rollback. Restore exact pre-change state only from tested backup under explicit security approval; otherwise forward-fix wrappers. |
| 10 | `20261010220500_dpp_ai_security_definer_search_path_hardening.sql` | Pins nine AI `SECURITY DEFINER` functions to repository invariant `public, pg_temp`. | #9 wrapper and `*_unbound` signatures plus hash helper must exist; confirm extension calls are schema-qualified. | Restore captured `proconfig` only if required and approved; preferred recovery is forward-fix because the migration is security hardening. |

## Dry-run evidence required immediately before approval

On the exact candidate SHA, repeat the isolated PostgreSQL 17 stack and require all of the following GREEN:

- all migrations replay from a fresh database;
- A2 actor-bound two-account/idempotency/CAS acceptance;
- integration, idempotency and audit contracts;
- tenant isolation, RLS, RBAC and exact RPC exposure/security-definer guard;
- product/provisioning/evidence/retention/shared-rate-limit contracts;
- isolated logical backup + restore drill;
- Stage 4, Stage 5, Step 18, Step 19, Step 20 and AI-first contract workflows.

Any migration/content SHA change after the dry-run invalidates the evidence and requires rerun.

## Production change checkpoint — STOP HERE WITHOUT APPROVAL

Before execution, the operator must present:

`candidate SHA | authoritative live applied-migration list | exact pending names | live object/ACL diff | DB backup evidence | Storage backup evidence | isolated restore evidence | dry-run URLs/results | rollback artifact/reference | maintenance window | owner approval`

If any item is missing, C04 stays RED and no migration is applied.

## Post-apply evidence sequence (only after separate production authorization)

1. Re-read authoritative migration registry; prove every intended migration name/version is applied.
2. Re-run read-only live catalog/ACL checks, including `anon EXECUTE = false` for sensitive RPCs and actor-bound/unbound access expectations.
3. Verify schema/function signatures, RLS/policies and fixed `search_path` on live objects.
4. Refresh the bound snapshot from authoritative evidence only. Do not hand-author applied records.
5. Run full CI/C04 and the same exact-SHA acceptance workflows.
6. Perform approved PC/browser/phone/physical QR E2E separately. Database green is not physical-flow proof.

## Known unresolved release evidence

- Fresh authoritative live migration registry is currently unavailable to this QA connection because `list_migrations` returned permission denied.
- Real encrypted bound-project DB backup has not been proven here.
- Real Storage object-byte backup and isolated Storage restore have not been proven here.
- Current independent evidence says the previous nine migrations were absent live; the new security hardening migration is therefore also not assumed applied.

Until these gaps close, the correct release state is **C04 RED / no production promotion**.
