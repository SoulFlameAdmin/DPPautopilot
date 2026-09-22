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

`tests/db/test_retention_deletion_subset.sql` proves eligible terminal imports are removed, their child staging rows cascade, old non-terminal/recent terminal imports are preserved, viewer access is denied, owner/admin access is allowed, too-recent cutoffs fail closed, audit delete events survive, and the non-destructive deletion-impact preview reports exact tenant-scoped counts while keeping destructive deletion unavailable. `tests/api/export.test.cjs` additionally proves evidence-byte integrity, pre-read `Content-Type` and `Content-Length` metadata checks, stable unavailable/tamper/oversize errors, deterministic slice selection, `has_more` / `next_offset`, pagination validation before upstream access, and page-scoped byte-cap behavior.


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


## Evidence response metadata integrity hardening — 2026-09-22

- Evidence byte export validates the object response `Content-Type` against manifest `content_type` before reading bytes.
- It now also validates `Content-Length`, when the upstream provides it, against manifest `byte_size` before `arrayBuffer()` is consumed. Malformed, unsafe or mismatched lengths fail closed with `502 EVIDENCE_EXPORT_INTEGRITY_FAILED`.
- Regression `include_evidence fails closed on content length mismatch before bytes are read` proves mismatch rejection occurs without consuming the evidence body.
- Implementation merged in PR #154 as commit `b82a0e03f082602c44759fbf2e16a5c2ece8fc81`.
- GitHub Actions run `35667737921` passed completely: M21 export HTTP contract tests PASS, R08 retention/deletion policy validator PASS, and the full validation job completed successfully with 139 completed steps and no failures.
- This hardening does not change the top-level acceptance state: R08 remains RED and M21 remains RED until their remaining dependencies and final runtime/production acceptance are satisfied. No Vercel deployment was attempted for this block.


## Versioned NDJSON export package precursor — 2026-09-22

- `GET /api/export?format=ndjson` now selects evidence export automatically and emits `application/x-ndjson; charset=utf-8` with attachment filename `dpp-export.ndjson`.
- Package version `ndjson-v1` has deterministic record classes: `dpp_export_header` → `dpp_bundle` → zero or more `dpp_evidence` records → `dpp_export_end`.
- Existing tenant/RBAC export RPC, manifest SHA-256/signing, pagination, response metadata checks, byte-size and SHA-256 verification remain authoritative. Selected evidence is fully verified before the first NDJSON record is emitted, so an integrity failure cannot leave a partially emitted package.
- The package stays compatible with paged/signed resume parameters and uses base64 evidence payloads.
- This is intentionally a precursor, not final large-tenant acceptance: the selected page is still verified in memory before emission. Constant-memory object streaming, a final archive format and real authenticated deployed large-tenant evidence remain pending.


## Canonical resumable pagination ordering — 2026-09-22

- Evidence paging now canonicalizes the manifest by `storage_path|id` before both SHA-256 calculation and page slicing.
- This closes a resume consistency gap where the same manifest set returned in a different upstream row order could previously preserve the same digest while changing which object appeared at a given offset.
- Regression `manifest resume remains deterministic when upstream manifest order changes` proves page 1/page 2 remain stable across reordered RPC responses.
- The T03 stateful export journey was updated to assert the canonical page order rather than incidental RPC row order.
- Implementation merged in PR #158 as commit `1a6daed12bd77f359e3268113c10ea50e929f254`.
- GitHub Actions run `35668964500` completed successfully with 139 completed steps and no failures; M21 export HTTP tests, T03 stateful API integration, R08 retention/deletion validation, and browser smoke all PASS.
- M21 and R08 remain RED at top level because their declared dependencies and production/runtime acceptance are not yet fully satisfied. No Vercel deployment was performed for this block.


## Bounded-memory verified NDJSON spool — 2026-09-22

- PR #162 merged as commit `70eb3f8e75de48de399010cbd6f903622c133202`.
- The `format=ndjson` path no longer accumulates the selected page's evidence byte/base64 payloads in process memory before emission. It consumes upstream response-body chunks incrementally, updates SHA-256 and base64 incrementally, and writes verified NDJSON evidence records to temporary spool files.
- The fail-closed integrity contract is preserved: Content-Type / Content-Length checks happen before body consumption where available, byte-size and SHA-256 are verified before any NDJSON response record is emitted, and a streamed hash mismatch returns `502 EVIDENCE_EXPORT_INTEGRITY_FAILED` with zero NDJSON writes.
- Verified spool files are streamed only after every selected object passes integrity checks; temporary spool state is cleaned after completion/failure.
- Regression `ndjson package incrementally spools streamed evidence without arrayBuffer` proves the streamed-body path avoids `arrayBuffer()`; regression `ndjson streamed hash mismatch fails closed before response emission` proves the pre-emission integrity guarantee on streamed data.
- GitHub Actions run `35669935627` completed SUCCESS with 139 completed steps and no failures. `Run M21 export HTTP contract unit tests` and `Validate R08 retention deletion policy` both passed.
- Top-level M21 and R08 remain RED because their declared dependencies and production/runtime acceptance are still incomplete. Final archive packaging and real authenticated deployed large-tenant acceptance remain pending. No Vercel deployment was performed for this block.
