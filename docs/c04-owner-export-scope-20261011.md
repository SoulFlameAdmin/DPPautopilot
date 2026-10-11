# C04 Phase 0 — private local Storage export scope verification

Status: **OFFLINE / NOT EXECUTED against production**. This utility does not back up or restore any bytes. It can never issue `BASELINE_RECOVERY_PASS`, `MIGRATION_REHEARSAL_PASS`, or mark C04 green.

## Purpose

An exported Storage folder can have correct hashes while missing some buckets or files. Compare the exported real object bytes against an **independently obtained** Supabase SQL inventory from *all* `storage.buckets` and `storage.objects`. Supabase DB backups include Storage metadata, not the actual object bytes.

## Private input contract

The owner obtains per-bucket totals through the existing read-only `scripts/c04-storage-backup-scope-select-only.sql`, at a known UTC timestamp. Store the independently captured inventory ONLY in `.c04-private/storage-inventory.json`. Example **synthetic** data:

```json
{
  "schemaVersion": "C04_STORAGE_INVENTORY_V1",
  "projectRef": "frhletkiuupgksmgxoxc",
  "capturedAtUtc": "2026-10-11T00:00:00Z",
  "bucketCount": 2,
  "objectCount": 1,
  "estimatedBytes": 4,
  "buckets": [
    { "id": "bucket-private", "objectCount": 1, "estimatedBytes": 4 },
    { "id": "bucket-empty", "objectCount": 0, "estimatedBytes": 0 }
  ]
}
```

Export the **real** Storage object bytes with owner-approved Supabase CLI or S3-compatible client to a protected encrypted local directory, following the layout `<bucket-id>/<object-path>`. Do not email or commit Storage bytes, private names, credentials, or manifests.

Then use the existing PR #336 local manifest command:

```powershell
node scripts/c04-owner-recovery-toolkit.mjs bytes-manifest "X:\DPP-C04\storage-export" .c04-private/storage-bytes.json
```

Validate both the independent inventory and all local bytes:

```powershell
node scripts/c04-owner-export-scope-verify.mjs verify .c04-private/storage-inventory.json .c04-private/storage-bytes.json "X:\DPP-C04\storage-export"
```

The verifier checks the project ID, per-bucket/global counts and byte totals, all manifest entries and hashes against actual exported bytes, and rejects path traversal, duplicate paths, symlinks and unexpected extra files. Its output contains aggregate numbers and non-sensitive error codes only.

`SCOPE_MATCH_ONLY` **is not a recovery PASS**. The tool cannot prove the source inventory was authentic/fresh, cannot prove object-name identity against live SQL (only counts and bytes), cannot verify DB dump completeness, and cannot assert consistent atomic capture when source objects changed. Such issues require independent owner evidence and reconciliation.

Next required actions: verify real encrypted DB export (roles/schema/data), actual Storage backup, isolated DB+Storage restore and measured RPO/RTO (`BASELINE_RECOVERY_PASS`), then copy and independently rehearse all ten frozen C04 migrations (`MIGRATION_REHEARSAL_PASS`). Only after both and separate owner approval may any production migration occur. **C04 remains RED.**

Official reference: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/storage/management/download-objects.
