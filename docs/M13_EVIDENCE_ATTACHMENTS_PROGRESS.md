# M13 — Evidence Attachments Progress

Status: **PARTIAL — master task remains RED**

This precursor implements the database/policy boundary for evidence files without claiming a real object-storage upload/download path.

Implemented: tenant-scoped evidence metadata; model/item/passport/registry/import related-record types; cross-tenant target rejection; dedicated `dpp-evidence` bucket metadata; organization-prefixed paths; project MIME allowlist (PDF/PNG/JPEG/CSV/JSON); 10 MiB project maximum; SHA-256 metadata; member-read/editor-write/admin-delete RLS policies; deny-by-default production grants; immutable M12 audit hook.

The 10 MiB/type allowlist is a DPP Autopilot product policy, not a legal requirement.

M13 remains **RED** because M03 is RED and no real Supabase Storage/API upload/download flow has yet been tenant-enforced and tested.

## Evidence — 2026-09-19

- Bound Supabase project already contained the M13 migration from the concurrent worker; repeat apply correctly reported the relation already existed, so no destructive re-apply was attempted.
- Runtime transaction/rollback suite returned `M13_EVIDENCE_METADATA_SUBSET_PASS`.
- Tenant isolation, cross-target rejection, viewer read-only behavior, MIME allowlist, 10 MiB maximum, organization-prefixed path enforcement and M12 audit capture were verified.
- Direct `anon`/`authenticated` grants on `dpp_evidence_attachments` remained zero.
- Full GitHub Actions run `35399987261` on `53b6bbe813bb4c06283b0cb1618ffbcdf145d301`: SUCCESS, including `Validate M13 evidence file policy`, `Run M13 evidence metadata subset` and browser smoke. Artifact `10570149074`.
- M13 remains RED until M03 and the real storage/API upload/download path are tenant-enforced and tested.

