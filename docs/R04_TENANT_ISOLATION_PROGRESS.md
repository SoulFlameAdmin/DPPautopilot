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
