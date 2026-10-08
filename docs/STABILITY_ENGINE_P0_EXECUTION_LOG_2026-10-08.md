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

## 2026-10-08 — Stage 1 owner START checkpoint
- Vercel deploy/billing intentionally deferred per owner; source/DB/API security and stability only.
- Confirmed bound DB `frhletkiuupgksmgxoxc` has 468 migrations, latest `20261007184343 dpp_technical_pilot_capacity_update`. Atomic ensure + anon revoke not applied; no live database edits performed.
- Supabase security advisor flags exactly **one unintended DPP anon SECURITY DEFINER RPC exposure**: `dpp_api_technical_pilot_update_capacity`. Four other anon DPP RPCs are explicitly expected public paths: `dpp_api_carrier_open`, `dpp_api_passport_public`, `dpp_api_passport_public_resolve`, `dpp_api_registration_request_create`. Do not indiscriminately revoke public passport resolution.
- `rls_enabled_no_policy` entries on private `dpp_*` tables can be deliberate deny-by-default; no permissive RLS policy is to be added just to silence advisors.
- DPP SQL ACL patch is STAGED on PR #293; `DPP Stage1 Engine Regression` GitHub Actions passed on a35e0841, no production migration applies.
- Twins PR #170 now includes defense against **viewer role modifying manufacturer answers through service-role-backed sync**. Writes require returned membership role owner/admin/editor, read-only dashboard open still permitted. The atomic RPC returns authenticated tenant role; unknown roles fail closed.
- Additional security acceptance tests exercise wrong-company mismatch before client session write, failed RPC before false reviewing, viewer read/deny-write, stolen dashboard token, dashboard open no repeated config revision, CORS preview impersonation, and 8/8 onboarding status.
- **Residual privileged-write caveat:** user-role is verified before a server service-role write, not atomically inside the same DB transaction. Independent reviewer must assess role-revocation TOCTOU before Stage 1 security GREEN; require a tenant-scoped authenticated RPC or equivalent DB-enforced authorization for final guarantee.
- **Status:** P0 under active development. Main CI C04 and Step18 still FAIL because of missing bound live migration and Borko-owned Step18 wrong-column fixture; separate pass of Engine contract tests does not clear them.

## Follow-up Stage 1 evidence — 2026-10-08, security/data-contract split

- **Root cause (separate questionnaires):** Twins Early Access `country/company/products/sku/annualVolume/users/systems/automation` was being written into canonical `onboardingQ1..8` even though DPP manufacturer Q1..Q8 have different semantics. This falsely completed real production onboarding and used service-role table writes. Engine removed these canonical table writes from Early Access and kept intake data in its own user-bound session. Real manufacturer 8/8 remains separate, authenticated DPP flow.
- **Twins Engine draft PR #170:** commit `d678923a73fa664d56c3ab824518ef7cee488afa`; DPP Tenant Atomic Contract GitHub Actions **SUCCESS** run `37786551376`. Verifies wrong-company, viewer denial, JWT session/ownership, no canonical manufacturing write, CORS, no fake completion.
- **DPP Engine draft PR #293:** new staged migration `20261008131800_dpp_onboarding_truthful_progress.sql`, copied from inspected bound `dpp_api_manufacturer_onboarding_configure()` function with six response status changes only. `company=done`; workflow/product/batch/dpp/qr/ready=pending. API configure validator and Node/DB contract tests updated accordingly.
- **Verified CI on Engine SHA `fb74ab1dbcb00ce72ea1731b5780627cd90fa871`:** Stage4 PASS, Stage5 PASS, Step19 PASS, Step20 PASS, dedicated Stage1 Engine Regression PASS. Main CI C04 FAIL and Step18 parallel tenant test FAIL remain explicit.
- **Database safety:** bound project currently has 468 applied migrations; neither atomic ensure nor capacity anon revoke nor truthful progress function replacement has been applied to production. Backup/restore acceptance still missing.
- Borko independently notified via Gmail of this P0 separation and exact SHA for review; no independent QA acceptance recorded yet.
- **Strict status:** both open PRs are DRAFT; no merge, no production deployment, no 100% GREEN claim. Vercel remediation deferred per owner.

## Stage 1 follow-up — verified Step18 closure and C04 deployment gap

- **Step18 is now green in actual disposable PG17 CI**: test-fixture query corrected to `active_organization_id` in commit `bd12f9296aa371db5949d1a1a87d3457505f9a33`; [run #37824785133](https://github.com/SoulFlameAdmin/DPPautopilot/actions/runs/37824785133) SUCCESS, with `P0_ORGANIZATION_ENSURE_PARALLEL_PASS` showing one organization and membership for two concurrent requests. Borko independent review remains open.
- **C04 remains correctly red**: read-only report [Engine run #37824544395](https://github.com/SoulFlameAdmin/DPPautopilot/actions/runs/37824544395) found 75 repo migration names, 72 in the bound DPP subset of the live snapshot, and exactly 3 unapplied names. Project-wide live history has 468 migrations.
- **Reconciliation finding**: 62 canonical matching migrations have different historical filename versions than recorded live migration versions. Existing C04 policy compares canonical **names**; timestamp differences are a provenance warning, not permission to change history or falsely update snapshots. Need independent schema/hash review.
- **Main CI remains FAIL on C04**. This is the **remaining known release-gate blocker among the previously failing Main CI and Step18 pair**. No production changes, no merge, no deploy; no proved provider backup restore.
