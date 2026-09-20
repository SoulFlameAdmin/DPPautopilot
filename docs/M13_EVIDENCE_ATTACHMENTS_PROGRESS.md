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


## Authenticated Storage bridge evidence — 2026-09-19

- PR #60 (`fix/m13-authenticated-storage-bridge-20260919`) added `supabase/functions/dpp-evidence-object/index.ts`.
- The function uses Supabase client context from the caller `Authorization` header with the project anon/publishable runtime key so existing Storage RLS remains authoritative; no privileged server key is present in the function source.
- Supported object operations are upload/download/delete against private bucket `dpp-evidence`; path, MIME, 10 MiB maximum and no-overwrite controls fail closed before Storage.
- First CI attempt `35467452734` correctly failed R01 because a public policy JSON field contained a forbidden secret identifier. The public policy field was renamed without weakening the source-code prohibition.
- Corrected PR CI run `35467513771` completed **SUCCESS**, including `Validate M13 evidence file policy`, R01 secret hygiene, DB/RLS suites and browser smoke.
- Supabase project `frhletkiuupgksmgxoxc` deployed Edge Function `dpp-evidence-object` as **ACTIVE v1**, function id `66fdbd22-ea40-49ee-a196-8b84b4a50fff`, `verify_jwt=true`, bundle SHA-256 `9ca527828da04bec19fba8e4b6afd82a710fe09b418e5f31112bacfe51f0e6ef`.
- Connector readback proved deployed `index.ts` exactly matches the GitHub branch source; caller-auth forwarding and upload/download/delete calls are present, and no service-role identifier/key material is present.
- PR #60 merged to `main` as `fddae0e28900a7829f756f231256363cb4b2f318`.

M13 remains **RED/PARTIAL**, not GREEN: a real authenticated user byte upload -> download/content verification -> delete roundtrip is still required, and declared dependency M03 remains non-GREEN. The previous “connector has no Storage object action” tooling gap is no longer a blocker because the JWT-protected Edge Function now provides the normal RLS-preserving object path.

## Pre-upload byte-integrity hardening — 2026-09-20

- The caller-JWT `dpp-evidence-object` upload path now performs a caller-RLS metadata lookup from `dpp_evidence_attachments` by bucket/path before Storage upload.
- Uploaded bytes are SHA-256 hashed with Web Crypto and must exactly match registered `byte_size`, `sha256_hex` and `content_type`.
- Missing/inaccessible metadata fails closed with `403 EVIDENCE_METADATA_NOT_AVAILABLE`; metadata/byte mismatch fails closed with `409 EVIDENCE_METADATA_MISMATCH`.
- Verification occurs before `.storage.from(BUCKET).upload(...)`, preserving the no-overwrite Storage policy and preventing registered hash metadata from silently diverging from object bytes.
- M13 remains RED/PARTIAL until M03 is GREEN and a real authenticated upload→download/content verification→delete roundtrip is proven against the deployed Edge Function/Storage path.


## Pre-response download integrity hardening — 2026-09-21

- `dpp-evidence-object` GET now performs a caller-RLS metadata lookup before Storage download.
- Downloaded bytes are SHA-256 hashed and must exactly match registered `byte_size`, `sha256_hex` and `content_type` before any byte response is returned.
- Missing/inaccessible metadata remains non-enumerating as `404 EVIDENCE_NOT_AVAILABLE`; byte/type/hash mismatch fails closed with `409 EVIDENCE_DOWNLOAD_INTEGRITY_FAILED`.
- The response `Content-Type` comes from verified metadata, not an untrusted object response alone.
- M13 remains RED/PARTIAL until M03 is GREEN and a real authenticated upload→download/content verification→delete roundtrip is proven against the deployed function.
