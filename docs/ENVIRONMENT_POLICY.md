# DPP Autopilot — Environment Policy

## Environments

### Development
- Local or ephemeral developer environment only.
- Uses non-production data and non-production credentials.
- Database schema must be created from committed migrations; no manual production-schema edits are copied back as source of truth.
- Secrets are loaded from local environment management and never committed.

### Preview / Staging
- Created from reviewed Git branches/PRs once the correct Vercel project is bound to `SoulFlameAdmin/DPPautopilot`.
- Uses a dedicated non-production Supabase project/branch when database work begins.
- Must not use production customer data unless an explicit approved sanitized dataset is provided.
- Required for integration/E2E/security/migration verification before production promotion.

### Production
- Only the canonical production Vercel project linked to `SoulFlameAdmin/DPPautopilot` may represent production.
- Production database must be the explicitly verified DPP Autopilot Supabase project; `soulflame-twins` is NOT approved by inference.
- Production deploys originate from `main` or a future protected release branch defined in CI/CD policy.
- Database changes are migration-driven and verified before incompatible application changes are promoted.

## Secret ownership

- Browser/public variables may contain only values intentionally safe for clients (for example a Supabase project URL and publishable/anon key, when the architecture calls for it).
- Service-role keys, database passwords, registry credentials, signing secrets and webhook secrets are server-only.
- Secrets must live in the hosting/database secret stores, scoped by environment.
- Secrets must never be committed to GitHub, logged, embedded into static assets, or copied into screenshots/evidence packs.
- Rotation is required after suspected exposure and before production if a credential was ever used in an unsafe environment.

## Promotion gates

1. Commit/PR passes repository validation and all applicable automated tests.
2. Preview deployment builds successfully.
3. Database migrations apply successfully to the non-production target.
4. Integration/E2E/security checks pass in preview/staging.
5. Release evidence records the commit SHA, migration versions and deployment ID.
6. Production deploy is promoted only after required gates pass.
7. Post-deploy smoke tests verify critical routes and runtime logs.

## Rollback / forward-fix

- Application rollback: redeploy/promote the last known-good immutable Vercel deployment when compatible with the active schema.
- Database changes: prefer backward-compatible expand/contract migrations. Destructive rollback is not assumed safe.
- When a migration is not safely reversible, use a tested forward-fix migration and keep the application backward compatible during the transition.
- Every production release must identify its last known-good application deployment and the schema version it expects.

## Data policy

- Development fixtures must be synthetic.
- Preview/staging uses synthetic or explicitly sanitized pilot data.
- Production data may only be processed after tenant isolation, RBAC, privacy inventory, retention rules, backups and recovery tests satisfy the master plan.

## Current binding state (2026-09-17)

- GitHub canonical repo: `SoulFlameAdmin/DPPautopilot`.
- Vercel binding: not yet established. Existing `dpp` project points to another repository and is not an allowed substitute.
- Supabase binding: not yet established. Existing `soulflame-twins` project is not an allowed substitute without explicit verification.
