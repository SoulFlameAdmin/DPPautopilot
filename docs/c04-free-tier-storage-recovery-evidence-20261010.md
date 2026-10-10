# C04 independent Free-tier backup scope and live Storage inventory — 2026-10-10

**Classification:** READ-ONLY observation, no backup artifacts created, no production writes. **C04 remains RED.**

## Verified owner-side observations

Bound Supabase project: `frhletkiuupgksmgxoxc` (`soulflame-twins`), database PostgreSQL 17. 
Supabase organization plan from `get_organization`: **`free`**. Official Supabase documentation states automated daily backups are provided for Pro, Team and Enterprise projects; a Free project should not be *assumed* to have an authoritative daily backup or PITR. Dashboard backup state and any manual exports remain unverified.

At `2026-10-10 20:47:48 UTC`, a read-only `pg_database_size(current_database())` measured **119,893,139 bytes**. This is allocated PostgreSQL database size, **not** dump/export size, a backup checksum, or an RPO.

Read-only `storage.buckets` + `storage.objects` metadata inventory on this same bound project:

| Bucket | Public | Object records | Metadata-estimated bytes |
|---|---|---:|---:|
| copy-studio-originals | yes | 0 | 0 |
| david-windows-releases | no | 0 | 0 |
| dpp-autopilot-static | yes | 5 | 49,255 |
| dpp-evidence | no | 0 | 0 |
| dpp-installers | no | 0 | 0 |
| parking-evidence | no | 0 | 0 |
| restaurant-public-assets | yes | 0 | 0 |
| sf-chat-media | no | 70 | 74,865,349 |
| sf-private-media | no | 5 | 688,325 |
| sf-profile-images | yes | 8 | 1,775,649 |
| sf-profile-media | yes | 8 | 23,635,241 |
| zorbas-public-assets | yes | 2 | 7,400,324 |
| **TOTAL** | **12 buckets** | **98 objects** | **108,414,143** |

**75 private and 23 public object records** (metadata only). Zero records in `dpp-evidence` does **not** prove that all external DPP evidence exists or that a shared-project recovery can ignore other buckets. Some non-DPP apps share the project. Restoring its PostgreSQL database affects more than DPP, including the metadata referencing private Storage objects.

These estimates came only from the stored `metadata.size` property and object row counts, and do **not** prove that physical object bytes are present, downloadable, complete, identical or recoverable. We did not enumerate private object paths, download any files or create a real backup. Do not publish private object names or content hashes tied to personally identifying filenames.

Live `list_migrations` at 2026-10-10 showed **470 records**, with two latest unrelated DAVID migrations. None of the ten DPP migration names in #332 were present. `dpp_api_organization_ensure` still absent; capacity RPC still grants `anon EXECUTE` while enforcing an internal role check. No migration or ACL changes were executed.

## What evidence can be generated owner-side without modifying production schema

1. **Backup availability inspection** (read only): owner checks Dashboard > Database > Backups and records whether an actual provider backup or PITR restore point exists. Free-plan status means no assumed daily backup; do not mistake `pg_database_size` for an export.
2. **Approved encrypted logical export** (backup action; not executed by this QA): designated owner/operator uses current documented Supabase CLI `db dump` or `pg_dump` from a protected environment, validating auth schema/roles and other dependencies. This reads live data and stores a sensitive artifact outside GitHub/email. Record UTC timestamp, file byte size, checksum and encryption/retention details **privately**. This step needs an operator with authorized backup access; the QA tool does not have a backup/download capability.
3. **Storage byte export separately**: use an authorized owner/S3 or Storage API workflow to copy **actual bytes** of all relevant buckets, including private buckets, into encrypted offsite storage. Snapshot its object count, exact bytes, object checksums and manifest. Do not rely on a database backup for Storage bytes.
4. **Restoration rehearsal to isolated infrastructure**: provision a separate **approved** sandbox (cost review required), restore both database and actual object bytes, reconfigure environment dependencies securely, and prevent that sandbox from sending production emails/webhooks or exposing original users. Capture start/end UTC, scope, restore duration, failures and checksums.
5. **Independent post-restore checks**: PostgreSQL role grants, RLS/tenant isolation, `SECURITY DEFINER` search paths, AI/A2 request CAS and negative two-actor tests, object checksum match for private Storage, and stable passport→QR identifiers. Record RPO/RTO *as measured*, not estimates.
6. **Rollback and owner sign-off**: exact commit/migration checksums, C04 regression URLs, recovery artifacts, rehearsed rollback procedure, maintenance window and explicit human owner authorization. Only then request any production SQL proposal, never assume authorization here.

## Hard stop

**Release evidence gaps as of this record:** no provider backup file/restore point proven; no encrypted real logical export artifact; no Storage object-byte export; no isolated real DB+Storage restore; no measured RTO/RPO; no physical QR/mobile acceptance. These are all **OPEN**, irrespective of isolated #330 pg_dump/pg_restore SUCCESS.

This file and companion `scripts/c04-storage-backup-scope-select-only.sql` exist to make those gaps explicit. Running the SQL cannot satisfy the backup gate. No production migration, grant/revoke, dump, deploy, merge, Storage download or snapshot modification was performed by this review.

Official references:
- Supabase Database backups: https://supabase.com/docs/guides/platform/backups
- Supabase logical backup: https://supabase.com/docs/guides/troubleshooting/download-logical-backups
- Supabase duplicate/restore-to-new-project requirements: https://supabase.com/docs/guides/platform/clone-project
