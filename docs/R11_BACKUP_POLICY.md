# R11 — Backup Policy

## Verified current platform state

- Supabase organization: `SoulFlameAdmin` (`touhddzpjdlrzmykcywf`).
- DPP-bound project: `frhletkiuupgksmgxoxc`, region `eu-west-1`, PostgreSQL 17.
- Verified organization subscription plan on 2026-09-18: **Free**.
- The current Free plan must **not** be represented as having production-grade automatic backup retention.
- Supabase documentation states automatic daily backups are a paid-plan capability; Pro currently documents 7 days of daily backup retention, Team 14 days, and PITR is a paid add-on. Storage objects are outside database backup scope.

## Backup scope

The production backup scope must include:

1. PostgreSQL schema and all DPP tables/functions/migrations.
2. Tenant/model/item/passport/import/history/audit records.
3. Auth-related application metadata needed for recovery.
4. Storage/evidence objects separately from database backups, because database backup does not restore deleted Storage API objects.
5. Canonical GitHub migrations/configuration as an independent recovery source.

## Current state and production requirement

Current Free-plan state is acceptable only for development/pre-production work with synthetic data. It is **not accepted as production disaster-recovery coverage**.

Before production acceptance, one of these must be verified:

- Upgrade to a paid Supabase plan with automatic backups and documented retention; or
- Establish a separately scheduled, encrypted, off-site logical backup process using `pg_dump` / Supabase CLI plus a separate evidence-object backup; and
- Complete R12 restore testing into an isolated environment.

PITR may be enabled if the product requires a materially lower RPO than daily backups; it must not be claimed as enabled until actual project evidence exists.

## Recovery objectives

Until production workload/pilot requirements define stricter values, the minimum target is:

- **Target RPO:** <= 24 hours for database records.
- **Target RTO:** <= 8 hours for service restoration from a verified backup plus canonical migrations.
- Evidence/storage object recovery must have an equivalent documented backup and restore path before pilot use.

These are product targets, not claims about the current Free plan.

## Operational controls

- Never store database passwords or backup encryption keys in Git.
- Backup credentials are server/operator-only secrets under R01.
- Backup artifacts must be encrypted at rest and access-controlled.
- Backup success/failure must become observable before C15.
- Project deletion is destructive and must not be used as a backup/restore workflow.
- Every production release evidence pack must record active backup mode, retention, latest successful backup and latest successful restore drill.

## R12 separation

R11 defines and verifies the policy against the actual current plan. **R12 remains RED** until a real backup is restored to an isolated environment and integrity checks pass.
