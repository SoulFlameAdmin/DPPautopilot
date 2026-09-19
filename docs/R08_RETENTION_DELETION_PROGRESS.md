# R08 Retention / Deletion / Export — Partial Progress

R08 remains **RED** because R07 is not GREEN and several regulatory/storage/auth retention decisions are intentionally unresolved. The precursor is fail-closed: it does not expose organization or user deletion.

## Implemented now

- `data/retention-deletion-policy.json` is the machine-readable policy precursor.
- Existing M21 owner/admin export is required before future organization deletion, but currently exports evidence metadata only, not evidence object bytes.
- Terminal import staging (`invalid` or `committed`) may be purged only after a minimum of 30 days.
- `staged` and `validated` imports are preserved regardless of age by this precursor.
- `dpp_api_retention_status()` reports the active tenant's deletion-readiness blockers and eligible import-staging count.
- `dpp_api_purge_import_staging(timestamptz)` is owner/admin-only, rejects cutoffs younger than 30 days, and preserves immutable audit DELETE events.

## Fail-closed deletion blockers

Organization deletion remains disabled until all of these are accepted and tested:

- full export including evidence object bytes;
- passport/version regulatory retention period;
- registry submission retention and external-recipient terms;
- evidence Storage object deletion lifecycle;
- audit snapshot retention/minimization exception;
- Auth account deletion workflow.

No legal/regulatory retention period is invented for those stores by this precursor.

## Evidence target

`tests/db/test_retention_deletion_subset.sql` proves eligible terminal imports are removed, their child staging rows cascade, old non-terminal/recent terminal imports are preserved, viewer access is denied, owner/admin access is allowed, too-recent cutoffs fail closed, and audit delete events survive.
