# C04 no-write reconciliation — 2026-10-10

Status: **READ-ONLY / NO PRODUCTION APPLY**

This document records the current C04 evidence mismatch for Issue #318 and PR #324 without claiming that any SQL object is absent from the live database.

## Bound snapshot

- File: `data/bound-supabase-migration-snapshot.json`
- Bound project: `frhletkiuupgksmgxoxc`
- Snapshot source: `Supabase list_migrations read-only connector`
- Snapshot observed at: `2026-10-07T18:43:43Z`
- C04 policy remains `default: deny` and requires all manifest migration names to be present before release evidence can pass.

The snapshot predates every migration listed below. Therefore the current C04 failure is expected evidence drift. It is **not** proof that the corresponding live SQL objects are missing, nor permission to edit the snapshot or apply production SQL.

## Current missing canonical migration names

| Repo migration file | Canonical name | Classification |
|---|---|---|
| `20261008024500_dpp_organization_ensure.sql` | `dpp_organization_ensure` | Pre-existing C04 blocker |
| `20261008131700_dpp_capacity_update_anon_execute_revoke.sql` | `dpp_capacity_update_anon_execute_revoke` | Pre-existing C04 blocker |
| `20261008131800_dpp_onboarding_truthful_progress.sql` | `dpp_onboarding_truthful_progress` | Pre-existing C04 blocker |
| `20261009222500_dpp_ai_intake_persistence_v1.sql` | `dpp_ai_intake_persistence_v1` | A2 Draft stack |
| `20261009222600_dpp_ai_intake_persistence_v1_hardening.sql` | `dpp_ai_intake_persistence_v1_hardening` | A2 Draft stack |
| `20261009222700_dpp_ai_conversation_cas_v2.sql` | `dpp_ai_conversation_cas_v2` | A2 Draft stack |
| `20261009222800_dpp_ai_candidate_conflict_constraint_fix.sql` | `dpp_ai_candidate_conflict_constraint_fix` | A2 Draft stack |
| `20261009222900_dpp_ai_manual_candidate_cas_v1.sql` | `dpp_ai_manual_candidate_cas_v1` | A2 Draft stack |
| `20261010213000_dpp_ai_request_actor_bound_idempotency.sql` | `dpp_ai_request_actor_bound_idempotency` | A2 actor-bound hardening in PR #324 |

## CI evidence on PR #324

Head SHA: `4bf3dbd5c1c73aa2b9daae596962eaa1ab50d10a`

- AI-first Intake Contract: **SUCCESS**
- New DB marker: `AI_ACTOR_BOUND_IDEMPOTENCY_DB_PASS`
- Existing A2 persistence/CAS/manual DB acceptance: **PASS**
- Stage 4: **SUCCESS**
- Stage 5: **SUCCESS**
- Step 18: **SUCCESS**
- Step 19: **SUCCESS**
- Step 20: **SUCCESS**
- Main CI: **FAIL only at C04** because the bound snapshot does not include the nine canonical migration names above.

## Required next evidence before any production action

1. Refresh live migration-registry evidence **read-only** and classify each of the nine names as applied, unapplied, renamed, or out-of-band/manual drift.
2. For any name not present in the registry, inspect the corresponding canonical objects, signatures, grants, RLS/security-definer boundaries and dependencies using read-only database evidence before deciding that SQL is actually pending.
3. Prove restorable logical DB backup and separate Storage object backup.
4. Perform isolated restore and dry-run all genuinely pending migrations in dependency order.
5. Re-run tenant/RLS/security-definer tests on the isolated target and record exact SHA/checksums.
6. Obtain explicit production approval before any live SQL, snapshot refresh, merge, promotion or deploy.

## Prohibited shortcuts

- Do not modify `data/bound-supabase-migration-snapshot.json` to make C04 green without authoritative read-only evidence.
- Do not weaken `scripts/validate_migration_deployment_gate.py`.
- Do not infer that a missing migration registry name means the SQL object is absent.
- Do not run production migrations, merge or deploy from this reconciliation step.

This document is evidence preparation only and keeps Issue #318 fail-closed.
