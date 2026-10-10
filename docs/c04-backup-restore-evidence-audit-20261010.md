# C04 backup / restore evidence audit — 2026-10-10

Status: **READ-ONLY EVIDENCE AUDIT / NO PRODUCTION ACTION**

This note distinguishes repository-tested recovery mechanics from evidence that a real bound-project backup can actually be restored. It must not be used to mark C04, E0.2 or production recovery GREEN by itself.

## What is genuinely proven in the repository

### R11 policy is explicit

`docs/R11_BACKUP_POLICY.md` records that the bound project is on the verified Free-plan state captured by the project and that this is not accepted as production disaster-recovery coverage. It requires either a qualifying managed-backup plan or a separately scheduled encrypted logical backup, plus a separate Storage/evidence-object backup and isolated restore testing.

The policy also requires credentials and encryption keys to remain outside Git, backup artifacts to be encrypted/access-controlled, and the active backup mode plus latest successful backup/restore drill to be recorded before production acceptance.

### R12 CI drill proves the logical mechanism only

The CI workflow contains an `R12 isolated logical backup restore drill` which:

1. builds a clean PostgreSQL 17 source from canonical migrations;
2. inserts synthetic records;
3. produces a custom-format `pg_dump`;
4. creates a second isolated database;
5. restores with `pg_restore`;
6. checks restored DPP tables, synthetic row counts, relationships, RLS and the canonical binding row;
7. emits `R12_RESTORE_DRILL_PASS` when the synthetic drill completes.

This is useful proof that the committed schema and logical dump/restore path are mechanically restorable. It is **not a restore of a bound-project backup and contains no real project data or Storage object bytes**.

### Isolated migration replay is useful but is not backup recovery

The independent non-release PostgreSQL 17 replay in Draft PR #323 proves the repository migrations can replay on a clean PostgreSQL target and can be subjected to DB/security tests. That is migration dry-run evidence, not evidence that a real production snapshot, Auth dependencies or Storage bytes can be recovered.

### Strict archive checker is intentionally preflight-only

`tools/engine/dpp_archive_check.py` checks the TOC of an existing local custom-format archive. Strict mode requires TABLE DATA entries for all 46 known DPP tables plus `auth.users`, `public.leads` and `storage.objects` metadata. Its output deliberately keeps both `database_restore_verified` and `storage_objects_restored_verified` false and never sets `recovery_gate_green` true.

That is the correct fail-closed behavior: an archive TOC proves archive structure, not a successful restore or object recovery.

## Bound-project evidence that already exists, but is not a backup

The Stage 1 preflight captured a read-only point-in-time inventory for project `frhletkiuupgksmgxoxc`, including migration history, DPP table/routine/column/RLS counts, row counts, structural fingerprint and DPP-named Storage metadata. It explicitly labels that inventory as a baseline rather than a data backup.

At that snapshot the preflight reported three DPP-named Storage buckets and five objects (49,255 declared bytes in `dpp-autopilot-static`). This is object metadata/count evidence only, not copied/restorable object bytes.

## Evidence still missing for a real recovery gate

| Evidence | Current status | Required before production migration approval |
|---|---|---|
| Actual provider backup / PITR availability and timestamp | **UNVERIFIED** | Owner-side provider evidence: backup type, latest completed UTC timestamp, retention, PITR state, project plan |
| Protected logical backup of real required DB scope | **NOT PROVEN** | Encrypted, access-controlled artifact or approved provider clone/snapshot path; record artifact size/checksum without exposing contents/secrets |
| Auth / external FK dependencies | **KNOWN REQUIREMENT, NOT RESTORED** | Include/restore required `auth.users`, `public.leads` and other approved dependencies at the same restore point |
| Storage metadata | **INVENTORIED** | Include matching metadata at the restore point |
| Actual Storage object bytes | **NOT BACKED UP / RESTORED IN REPO EVIDENCE** | Separate encrypted object-level backup and restore; verify count/size/checksums without publishing sensitive objects |
| Real isolated database restore | **NOT PROVEN** | Restore the approved real backup into a new isolated destination, never the shared production project |
| Post-restore DB integrity | **NOT PROVEN FOR REAL BACKUP** | Counts at matching restore point, FK lineage, identifiers, versions/audit, constraints/indexes |
| Post-restore tenant/RLS/RBAC negatives | **NOT PROVEN FOR REAL BACKUP** | Cross-company denial plus authorized positive cases on isolated restore |
| Public QR identity after real restore | **NOT PROVEN** | Verify canonical public resolution against restored records without exposing customer identifiers in shared evidence |
| Observed restore duration / RPO / RTO | **NOT PROVEN** | Record actual rehearsal start/end, source backup timestamp and measured loss window |
| Independent sign-off | **PENDING** | Borko read-only evidence review + engineering invariant review + owner approval |

## Safe next execution order

1. Obtain owner-side provider backup evidence without clicking Restore or changing project state.
2. Select an approved recovery source: provider restore/clone where supported, or an encrypted logical export that includes required dependencies.
3. Produce a separate encrypted Storage object backup for the DPP buckets at the same logical recovery point where feasible; record manifest count, total bytes and cryptographic hashes in private evidence.
4. Restore the database only into an isolated PostgreSQL 17 / approved isolated project.
5. Run the existing read-only restored-database checks plus tenant/RLS/RBAC/security-definer tests against that isolated restore.
6. Restore Storage bytes into the isolated destination and compare the private manifest.
7. Record exact source restore point, artifact checksums/sizes, restore duration, test SHA/run IDs, failures and rollback notes.
8. Obtain independent review and explicit owner approval before any bound-project SQL, snapshot refresh, merge, promotion or deploy.

## Stop rules

- Do not call the current synthetic R12 drill a real production backup restore.
- Do not call the Stage 1 metadata baseline a backup.
- Do not call archive-TOC inspection a successful restore.
- Do not refresh `data/bound-supabase-migration-snapshot.json` from repository expectations.
- Do not apply production migrations merely because clean-PG replay passes.
- Do not place database credentials, encryption keys, user data or Storage object contents in GitHub/email artifacts.
- Do not perform an in-place restore on the shared project for testing.

Until the missing real-backup and Storage-byte evidence is supplied and independently verified, **C04/E0.2 remain fail-closed**.
