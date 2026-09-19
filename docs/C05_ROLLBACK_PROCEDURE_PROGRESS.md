# C05 Rollback Procedure — Partial Progress

C05 remains **RED** because C03 and C04 are still RED and no real production deployment exists to roll back.

## Decision model

Rollback is default-deny and has three distinct paths.

### 1. Application rollback

Use only for an application regression when a last-known-good immutable deployment is available on the canonical Vercel project. The target must be READY, previously verified, and explicitly compatible with the **currently active database schema**. An application rollback must not mutate or roll back the database.

Any Vercel rollback/redeploy/promotion action is subject to the DAVID Vercel deployment lease before execution.

### 2. Database forward-fix

For an incompatible, irreversible or defective migration, destructive schema rollback is not assumed safe. Prefer a tested forward-fix migration. Its exact candidate commit must pass the C04 migration gate and isolated schema verification before release.

### 3. Isolated restore → controlled recovery

For data corruption or data loss, never restore directly over production as a first step. Identify the backup/recovery point, restore to an isolated environment, and verify schema, relational integrity, RLS and DPP binding. Document the data-loss boundary and the Storage/evidence-object recovery state separately. A destructive production recovery action requires explicit authorization.

## R11 / R12 boundaries

R11 records that the current Supabase Free plan is not accepted as production-grade automatic backup coverage and that Storage objects require a separate recovery path. R12 proves the committed logical PostgreSQL backup/restore path only with synthetic data in an isolated environment.

## What this precursor proves

`scripts/verify_rollback_evidence.py` rejects unsafe rollback evidence, including schema-incompatible app rollback, app rollback with DB mutation, forward-fix commit drift, direct production restore, missing production recovery authorization, and wrong canonical project.

No Vercel deployment, production rollback or database restore is executed by this precursor.

## Before GREEN

C05 requires C03/C04 GREEN plus a real last-known-good deployment and an evidence-backed live drill proving rollback/recovery, exact release/database identity and post-recovery smoke checks.
