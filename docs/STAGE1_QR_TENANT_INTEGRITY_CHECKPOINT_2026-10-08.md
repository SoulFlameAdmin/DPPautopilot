# SOULFLAME DPP — STAGE 1 / QR + CROSS-TENANT INTEGRITY CHECKPOINT
**2026-10-08 (Europe/Sofia) — reviewed exact GitHub test run; this document is an evidence overlay only.**

## Source and ownership
Repo `SoulFlameAdmin/DPPautopilot`, branch `mitko/dpp-stability-engine`, draft PR #293. No merge, no production deployment, no live SQL writes. Vercel remediation deferred per owner.

## Engine source fix: QR revocation consistency
- The previously cached ACTIVE QR SVG could remain available from a shared CDN cache long after a later passport state change, because the QR endpoint had `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.
- `api/qr.js` now returns `Cache-Control: no-store` **after verifying ACTIVE on each QR request**. This prevents stale image responses being served after a later DRAFT, suspension or revocation. A printed QR still points to the original canonical passport URL; the public passport resolver remains the authority about current public status.
- Added negative tests for DRAFT, suspended, retired, revoked, replaced (404/no SVG), forged/mismatching unique identifier (404), no-store on ACTIVE and stable QR target after an updated active passport payload. Test source `tests/api/qr.test.cjs`.
- Engine workflow `.github/workflows/engine-stage1-security.yml` now executes QR API tests independently of blocked Main CI C04. **Run #37820965065 SUCCESS**: 38 Python Engine tests PASS, 9 manufacturer-onboarding Node tests PASS, 10 QR Node tests PASS, all on commit `9be7dec29c6908c2de67485ac3f104034653229f`.
- These are mocked resolver contract tests, **not a fresh real phone/physical QR acceptance**.

## Production data consistency read-only audit
One read-only aggregate SQL query against bound Supabase `frhletkiuupgksmgxoxc` found **0 mismatches across all 11 checks**:
1. item / model organization mismatch — 0;
2. passport / item organization mismatch — 0;
3. passport version / passport organization mismatch — 0;
4. provision batch / model organization mismatch — 0;
5. batch item / battery organization mismatch — 0;
6. batch passport / passport organization mismatch — 0;
7. batch recorded serial != battery unique identifier — 0;
8. batch passport/item pair mismatch — 0;
9. null/blank battery serial — 0;
10. duplicate battery unique identifier within an organization — 0;
11. duplicate passport version number within a passport — 0.

This checks **existing row relationships**, not full RLS bypass prevention or two independent users' ability to access another company's data through every API.

The query is also part of `tools/engine/dpp_restored_database_readonly.sql` for future isolated recovery verification; four static safety/coverage checks in `tests/engine/test_dpp_restored_integrity_sql.py` were added and are included in the 38 Engine tests.

## Still blocking GREEN
- Step18 independent parallel-tenant test: references nonexistent `dpp_user_tenant_context.organization_id` instead of `active_organization_id`. Assigned to Borko, exact failing run #37814635250; cannot be waved through.
- Main CI C04: bound Supabase migration snapshot correctly reports the **three** unapplied repo migrations. Must **not** edit snapshot or mark PASS before reviewed provider backup/recovery and actual migration apply:
  `dpp_organization_ensure`, `dpp_capacity_update_anon_execute_revoke`, `dpp_onboarding_truthful_progress`.
- Real managed provider backup and isolated restore are **not proven**; connected Supabase provides no managed backup list/clone action.
- Cross-tenant negative runtime tests (Company A vs B), role-revocation TOCTOU, production 402 (deferred), UI review and physical printed QR scan remain open.
- No attempt made to merge, change shared database, expose API secrets or deploy Vercel.

**Decision:** QR / restore-contract source tests GREEN on the exact tested SHA. **Overall Stage 1 remains YELLOW/RED on unresolved release gates.**
