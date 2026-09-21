# R08 Retention / Deletion / Export — Partial Progress

R08 remains **RED** because R07 is not GREEN and several regulatory/storage/auth retention decisions are intentionally unresolved. The precursor is fail-closed: it does not expose organization or user deletion.

## Implemented now

- `data/retention-deletion-policy.json` is the machine-readable policy precursor.
- Existing M21 owner/admin export is required before future organization deletion. `GET /api/export?include_evidence=1` reads private evidence objects through the caller-JWT Storage bridge, verifies byte size + SHA-256 against the manifest, and includes verified base64 bytes. Optional `evidence_offset` / `evidence_limit` parameters provide deterministic paging (default 25, max 100 objects when paging is requested); the 25 MiB inline cap applies to the selected page. Missing objects, integrity mismatch, invalid paging or page overflow fail closed.
- Terminal import staging (`invalid` or `committed`) may be purged only after a minimum of 30 days.
- `staged` and `validated` imports are preserved regardless of age by this precursor.
- `dpp_api_retention_status()` reports the active tenant's deletion-readiness blockers and eligible import-staging count.
- `dpp_api_org_deletion_impact()` is an owner/admin-only, non-destructive preview that counts tenant-scoped memberships, contexts, product/passport/import/registry/evidence/audit records and declared evidence bytes, while explicitly keeping destructive deletion unavailable.
- `dpp_api_purge_import_staging(timestamptz)` is owner/admin-only, rejects cutoffs younger than 30 days, and preserves immutable audit DELETE events.

## Fail-closed deletion blockers

Organization deletion remains disabled until all of these are accepted and tested:

- final large-tenant archive/streaming package acceptance beyond the paged JSON precursor and signed resume-token precursor;
- passport/version regulatory retention period;
- registry submission retention and external-recipient terms;
- evidence Storage object deletion lifecycle;
- audit snapshot retention/minimization exception;
- Auth account deletion workflow.

The deletion-impact preview also marks external Storage enumeration as required, keeps Auth users outside organization deletion, and returns machine-readable blocker codes. No legal/regulatory retention period is invented for those stores by this precursor.

## Evidence target

`tests/db/test_retention_deletion_subset.sql` proves eligible terminal imports are removed, their child staging rows cascade, old non-terminal/recent terminal imports are preserved, viewer access is denied, owner/admin access is allowed, too-recent cutoffs fail closed, audit delete events survive, and the non-destructive deletion-impact preview reports exact tenant-scoped counts while keeping destructive deletion unavailable. `tests/api/export.test.cjs` additionally proves evidence-byte integrity, stable unavailable/tamper/oversize errors, deterministic slice selection, `has_more` / `next_offset`, pagination validation before upstream access, and page-scoped byte-cap behavior.


## Resumable evidence export consistency precursor — 2026-09-20

- Paged evidence export now returns a deterministic `manifest_sha256` derived from canonical evidence manifest identity/path/size/hash tuples.
- A later page may send `evidence_manifest_sha256`; if the manifest changed, export fails closed with `409 EVIDENCE_EXPORT_MANIFEST_CHANGED` before any object bytes are fetched.
- Invalid digest shape fails closed with `400 EVIDENCE_EXPORT_MANIFEST_INVALID` before the export RPC.
- This gives stateless resume/drift detection but is not yet a signed archive manifest or final streaming package.


## Signed resumable evidence-manifest precursor — 2026-09-21

- Paged evidence export can opt into a signed resume contract with `evidence_manifest_signed=1`.
- The response includes `manifest_token` using `HMAC-SHA256-v1` over the canonical manifest SHA-256. Later pages send the token as `evidence_manifest_token`.
- The HMAC key is server-only in `DPP_EXPORT_MANIFEST_SIGNING_KEY`, requires at least 32 bytes, and is never returned or embedded in client assets.
- A tampered but well-shaped token fails closed with `400 EVIDENCE_EXPORT_MANIFEST_TOKEN_INVALID` before evidence-object download.
- A valid token for an older manifest fails closed with `409 EVIDENCE_EXPORT_MANIFEST_CHANGED`; missing signing configuration fails the signed path with `500 EVIDENCE_EXPORT_SIGNING_UNAVAILABLE`.
- The existing unsigned `evidence_manifest_sha256` resume contract remains backward compatible. Final archive/streaming package format and real authenticated deployed large-tenant acceptance are still pending.
