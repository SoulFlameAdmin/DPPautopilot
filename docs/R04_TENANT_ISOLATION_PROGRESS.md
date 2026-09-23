# R04 — Tenant Isolation Security Progress

Status: **PARTIAL — master task remains RED**

This dependency-safe database attack matrix expands the M05 precursor across protected DPP surfaces that already exist.

Covered attack cases:

- cross-tenant enumeration of models, items, passports, passport versions and evidence
- direct-ID guessing for cross-tenant update/delete
- forged tenant IDs on inserts
- evidence-object metadata forgery
- tenant-scoped audit-log visibility
- viewer read-only boundaries
- owner of tenant B attempting direct-ID reads of tenant A

The test uses temporary `authenticated` grants and synthetic identities only inside an explicit transaction/rollback; production direct table grants remain closed.

R04 remains RED until M17-M21 exist and equivalent cross-tenant attacks are exercised through the authenticated API/export surfaces.

## Evidence — 2026-09-19

- Bound Supabase transaction/rollback suite returned `R04_DB_TENANT_ISOLATION_SUBSET_PASS`.
- Covered cross-tenant enumeration, guessed-ID update/delete, forged tenant inserts, evidence metadata forgery, viewer write denial, and tenant-scoped audit visibility.
- Full GitHub Actions run `35400349613` on `6d77ddc65660a92d657514dc01b02b51854adb0f`: SUCCESS, including `Run R04 DB tenant isolation subset` and browser smoke.
- UI artifact: `10568949488`.
- R04 remains RED until M17-M21 expose API/export surfaces and the same attacks are verified there.

## M05 bound RLS readback — 2026-09-23

- Every current DPP table inspected has RLS enabled, including models, items, passports, evidence, imports, organizations, memberships, tenant context, audit and registry submissions.
- Tenant-bearing models/items/passports/evidence/import/registry surfaces retain role-scoped SELECT/INSERT/UPDATE/DELETE policies through `dpp_has_org_role(...)`.
- Models/items/passports and other tenant resources therefore require membership in the row's `organization_id`; viewer remains read-only, editor gains create/update, and destructive operations remain owner/admin scoped as defined by the policy set.
- Tables intentionally exposed only through narrow RPCs may have zero row policies and stay deny-by-default because direct client table grants remain closed.
- This live readback reinforces the existing negative M05/R04 matrices; M05 remains RED solely because declared dependencies M02/M03 are not GREEN.

