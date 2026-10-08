# SOULFLAME DPP — ENGINE P0 EXECUTION LOG
Date: 2026-10-08 (Europe/Sofia)
Workstream: Mitko + GPT Engine
Branch: `mitko/dpp-stability-engine`
Base: `mitko/final-auth-clean-e2e-v1@ae888cd6bbb1e01dab80f028dab1e524b839123e`

## Purpose
Record independently checked blockers and ENGINE-owned actions before writes to bound production DB. This file is not an acceptance certificate; it is a read-only preflight + work assignment.

## Binding / code state (read-only checked 2026-10-08)
- GitHub canonical repository: `SoulFlameAdmin/DPPautopilot`.
- Auth pilot PR #292: OPEN, DRAFT, head `ae888cd6bbb1e01dab80f028dab1e524b839123e`, base `borko/manufacturer-integration-v2`. Merging or deployment is NOT authorized by this log.
- Bound Supabase production project: `frhletkiuupgksmgxoxc` (`soulflame-twins` project; DPP tables prefixed `dpp_`).
- Applied live migrations currently stop at `20261007184343 dpp_technical_pilot_capacity_update`.
- Repo-only pending migration: `supabase/migrations/20261008024500_dpp_organization_ensure.sql`; live list does **not** include `dpp_organization_ensure`. No production migration has been applied by this workstream yet.
- Code migration reviewed at current PR head: definer RPC `dpp_api_organization_ensure(text,text)`, per-user advisory transaction lock, active organization replay, recovery only for exactly one membership, DP103 for ambiguous multiple memberships, authenticated-only execute.
- Historic Vercel runtime evidence: `DEPLOYMENT_DISABLED`, HTTP 402 on production endpoints even when deployment metadata is `READY`. Independent retry of DPP endpoint by connector failed to return a current body; Twins endpoint still returned 402 on 2026-10-08. Treat both as BLOCKED until HTTP 200 is proved externally.
- Known security finding requiring confirmation and remediation: `anon` role reportedly has EXECUTE on `public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamptz)`; role check inside RPC is not a substitute for least privilege. The security hardening must be additive and regression tested without breaking intended authenticated use.
- Independent CI audit on PR #292 head showed main CI C04 fails because repo migration is missing from bound snapshot and Step 18 fails an SQL reference to `dpp_user_tenant_context.organization_id` (actual column is `active_organization_id`). UI CI passes must not mask security/DB failures.
- Twins backend still implements an alternate organization path. New manufacturer frontend is moving to atomic ensure. One frontend change alone does not eliminate cross-system tenant drift.
- Truth rule: `workspace configured` != `manufacturing completed`. Do not mark product/batch/DPP/QR done unless the actual backing entities/evidence exist.

## Engine ownership, in ordered phases

### E0 — Freeze and safety
1. Freeze exact app SHA, twins SHA, deployed SHA, migration versions, project mapping and env ownership.
2. Verify available backup/PITR or export and documented RESTORE test for the bound Supabase project. Never risk a DDL change without an approved recovery path.
3. Resolve Vercel account/payment condition through the authorized account owner. Independent `GET /`, private/dashboard route, and public passport checks must return expected HTTP and functional data.

### E1 — Security/DB
4. Review `dpp_organization_ensure` SQL against deployed schema, SECURITY DEFINER search path, permissions, lock and tenant invariants.
5. Apply the reviewed migration only to bound project after E0 safety acceptance. Verify via `list_migrations`, `pg_proc`, execute permissions and negative/parallel tests. Provide **exact version and name** to Borko; snapshot update occurs only AFTER live confirmation.
6. Revoke unintended `anon` EXECUTE for capacity-update RPC in reviewed additive migration. Verify `authenticated` + valid role can still perform action and `anon` or wrong tenant cannot. Run security advisors afterwards.
7. RLS/RBAC cross-company negative matrix, user context verification, service-role secret handling, evidence/storage restrictions, audit/version-history invariants.

### E2 — Cross-repository tenant canonicalization
8. Refactor `SoulFlameAdmin/soulflame-twins/api/dpp-dashboard-link.js` tenant path; avoid server-only direct table writes if they compete with atomic ensure. Preserve OAuth bearer validation, owner checks, intended Early Access session semantics and 1-membership recovery.
9. Never select an arbitrary membership when 2+ exist. Prove 2-tab/2-service concurrency does not create or open wrong company.
10. Distinguish onboarding metadata statuses from actual manufactured models, batches, DPP and QR records.

### E3 — Domain API verification
11. Models / batch / item provisioning / passport / QR, idempotency, optimistic concurrency, lifecycle DRAFT→technical-pilot ACTIVE, public/private boundaries, stable identifiers, same printed QR after update.
12. Import/export, registry and support only to the extent included in current pilot scope; do not represent simulation-only extensions as production.

### E4 — Independent acceptance handoff
13. After a candidate is integrated and internally tested, send exact engine PR/commit SHA, deployed SHA, schema version, tests and evidence to Borko.
14. Borko independently reruns CI, Step18, Stage4/5, Step19/20, U07, cross-browser and negative tenant tests. His review must explicitly verify engine changes, not just frontend code.
15. User + both teams conduct clean E2E with two separate new companies/accounts and physical print+phone scan, then sign off Battery v1 Pilot READY only if G0–G5 satisfy their acceptance criteria.

## Reserved ownership
- Engine: `api/*`, `supabase/migrations/*`, Twins backend/API, production infra, release and secrets (authorized only).
- Borko: frontend UI/UX, visual and browser suites, `tests/db/test_organization_ensure_parallel.sh`, GitHub CI test wiring.
- Shared files must be assigned one owner before editing; no simultaneous edits/force pushes/hidden production updates.

## Stop conditions
- Missing tested backup/recovery path before production DDL.
- Active Vercel 402, failed required CI/security check, cross-tenant data visibility, inability to validate live migration, wrong-organization sign-in, public DRAFT QR, fabricated UI readiness or unapproved regulatory claim.
- No `GREEN` or `100%` from a message alone. Every acceptance references a SHA, test/run, DB migration version, HTTP response and/or physical evidence.

## Execution status
- `E0.1` **STARTED**: exact repo/PR and migration baseline checked; separate Engine branch created.
- `E0.2` **BLOCKED / TO VERIFY**: backup/PITR and tested restore evidence.
- `E0.3` **BLOCKED**: Vercel 402/account issue.
- `E1-E4` **PENDING**: no production mutation or deploy has been executed.


## 2026-10-08 ENGINE stage 1 — verified code, still unreleased
- Twins branch created: `SoulFlameAdmin/soulflame-twins@mitko/dpp-stability-twins-engine` from exact deployed base `037efcd5f5c7e30c9ad01cfa353d9608bc10ad0c`.
- Twins **DRAFT PR #170**: https://github.com/SoulFlameAdmin/soulflame-twins/pull/170. Real code changes now staged in `api/dpp-dashboard-link.js` — authenticated caller JWT to atomic ensure, explicit mismatch/DP103 failure, no arbitrary first-membership fallback, no forged manufacturing DONE, historic stored DONE converted to pending on output.
- Latest code commit `f4d756c90a25c3b48e8322fa768f8f7e6492248b`; contract tests updated `8df0365e3b44b93a30818aef8687c0f5c91e8f80` and independent GitHub Actions workflow added at `.github/workflows/dpp-tenant-atomic.yml` (`d5b4ea539ea4b30d4770310a8de23bc99cfa3a7b`).
- 13/13 mocked contract cases PASS in an isolated V8 harness against committed code and tests. **Not equivalent to official GitHub Actions PASS**, concurrent 2-tab live SQL test, security acceptance or real client E2E.
- Additional conservative release probe staged: `tools/engine/production_http_gate.py`, commit `857f3e9943506fc141326df819e176ed05e67d7f`; unit tests `tests/engine/test_production_http_gate.py`, commit `b813a81ff8ee3334827b212c67003877f8143d43`. Any HTTP 402/DEPLOYMENT_DISABLED must fail this gate.
- Borko notified via Gmail about DRAFT PR #170, required independent verification and do-not-merge rule.
- **UNCHANGED**: production Supabase migration is absent, production Vercel 402 unresolved, no schema writes, no merge, no production deployment. Remain BLOCKED on E0 recovery and E1 verified migration before promoting any new backend code.
