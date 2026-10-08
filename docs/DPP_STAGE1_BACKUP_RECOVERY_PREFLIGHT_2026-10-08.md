# SOULFLAME DPP — STAGE 1 / E0.2 BACKUP & RECOVERY PREFLIGHT
**Date:** 2026-10-08 (Europe/Sofia)  
**Status:** **YELLOW — read-only inventory and schema reconstruction checked; provider backup and data restore NOT PROVEN.**  
**Project:** `soulflame-twins` / `frhletkiuupgksmgxoxc` (eu-west-1, PostgreSQL 17.6, ACTIVE_HEALTHY).  
**Safety:** This Supabase project is shared with SoulFlame/Twins and other initiatives. No direct production SQL DDL/DML, global rollback, user export or secret exposure is allowed in this phase.

## What was verified directly (read-only Supabase queries)

| Inventory / consistency | Verified value |
|---|---:|
| Applied project migration history | 468 migrations |
| Latest applied migration | `20261007184343 dpp_technical_pilot_capacity_update` |
| DPP public tables | 46 |
| DPP public routines | 129 |
| DPP public columns | 522 |
| DPP public RLS policies | 47 |
| DPP public tables with RLS disabled | **0 observed** (all 46 listed tables RLS enabled) |
| DPP table+index storage, estimate | 3,768,320 bytes |
| DPP structural column fingerprint | `d78d9fab43f514fab9d08ab49db8b855` |
| Organizations | 3 |
| Battery models | 4 |
| Provision batches (**actual table** `dpp_provision_batches`) | 2 |
| Battery items | 24 |
| Digital passports | 24 |
| Passport versions | 48 |
| Audit events | 105 |
| Early Access sessions | 3 |
| Manufacturer configurations | 1 |
| Manufacturer answers | 8 |
| DPP-named Storage buckets | 3 |
| Objects currently in DPP-named Storage buckets | 5 |
| Orphan items without models | 0 |
| Orphan passports without item | 0 |
| Organization memberships without organization | 0 |
| Active tenant contexts with no matching membership | 0 |
| Existing Supabase development branches | 0 |

Inventory is a **point-in-time read-only baseline**, not a data backup. The structural fingerprint is a reproducibility aid, not evidence that all row content is preserved.

## Already demonstrated: disposable schema rebuild, NOT live data recovery

DPP GitHub Stage 5 PostgreSQL 17 CI on the Engine branch passed, including replaying repository SQL migrations into a disposable PG17 database and running DB acceptance fixtures (e.g. [Stage 5 run 37797312342](https://github.com/SoulFlameAdmin/DPPautopilot/actions/runs/37797312342)). The Stage 1 Engine regression passed on the same commit. This validates migration replay and synthetic test fixtures only. **It does not recreate the 24 real production passports, their history, the users, stored evidence files, or original secrets.**

## Why this is NOT BACKUP GREEN

- Connected Supabase tools expose project details, migrations, read-only SQL and branches, but **do not expose the managed backup/PITR list or let us safely perform an isolated restore from an existing provider snapshot**. Provider backup availability, timestamp and retention remain unverified.
- Supabase's managed daily database backups depend on the **actual Supabase project plan** (not the user's ChatGPT plan). The project plan and whether PITR is enabled have not been read from the account.
- An in-place **project-wide restore would also rewind unrelated DAVID/Twins/SoulFlame data**. Do not launch such a restore merely to recover DPP. Require a project-owner-approved recovery design.
- Supabase DB backups include Storage *metadata*, **not the actual Storage objects**. The five DPP-named objects require separate, access-controlled object-level recovery evidence.
- A table-only DPP logical dump may have foreign-key dependencies on `auth.users`, organization or storage records. It is not independently restorable as a complete working platform without carefully captured dependencies.

## E0.2 Safe recovery verification — required actions, in order

**Gate R1 — Confirm provider backup is REAL (not inferred).**  
Owner opens [the project's Backup dashboard](https://supabase.com/dashboard/project/frhletkiuupgksmgxoxc/database/backups). Record *backup type*, latest completed backup timestamp (UTC), available retention window, PITR status if applicable, and project plan. No restore click. A screenshot without access tokens or PII is sufficient for the inventory stage.

**Gate R2 — Confirm data and Storage separately.**  
Document the protected export path for DPP rows + membership/user dependencies and the three DPP-named Storage buckets. The most recent read-only metadata query found **5 objects totaling 49,255 declared bytes in `dpp-autopilot-static`**; the other DPP-named buckets contain no objects at that snapshot. No sensitive contents in GitHub, emails, or public artifacts; backup must be encrypted and access-controlled. Confirm provider's managed backup cannot alone reconstruct missing Storage bytes.

**Gate R3 — Prove recovery in an isolated destination.**  
Use a *new isolated test destination* or an owned local PostgreSQL 17 instance, never the shared production project. Import an approved snapshot at a known restore point (without sharing credentials with collaborators). Record success/failure of SQL data import, necessary Auth relations, Storage object recovery, and indexes/constraints. Any new billed Supabase project/branch requires explicit owner cost confirmation first.

**Gate R4 — Compare restored data at the SAME restore point.**  
Verify actual tenant scope, counts, and sample record lineage using an authorized user. Verify model→item→passport linkage, passport versions, audit trail, unique identifiers, DRAFT/ACTIVE behaviors, RLS/RBAC including negative cross-company access, and public QR identity. Compare the restored point's manifest to the matching source snapshot; current live counts could legitimately change later. Do not expose live IDs or user emails in shared reports.

**Gate R5 — Document an executable safe rollback plan.**  
Specify expected downtime, loss window/RPO, time to restore/RTO observed in the rehearsal, owner, exact release SHA, migration version, last good snapshot timestamp, Auth secrets management, Storage objects and cache invalidation. Distinguish `ROLLBACK RELEASE` (code) from database restore and from compensating SQL migration. No destructive database operation on production without specific approval.

**Gate R6 — Independent sign-off.**  
Borko performs read-only verification of evidence (run IDs, restore point, counts, negative tenant checks); Engine verifies migration and database invariants; owner approves. Only then mark E0.2 **GREEN** and proceed to any bound project SQL migration.

## Migration freeze / next release context
Staged but **NOT APPLIED**: `20261008024500_dpp_organization_ensure.sql` (organization atomic ensure), `20261008131700_dpp_capacity_update_anon_execute_revoke.sql` (privilege revoke), `20261008131800_dpp_onboarding_truthful_progress.sql` (remove fabricated onboarding completion). Updating `data/bound-supabase-migration-snapshot.json` before actual live application would be false evidence.

## Acceptance judgment on 2026-10-08
- **Read-only inventory:** PASS.
- **Schema reconstruction in disposable PG:** PASS for migration replay + synthetic fixture acceptance (not production restore).
- **Provider snapshot / PITR proven available:** NOT CHECKED; connector lacks backup listing.
- **Real DPP data restored to isolated environment:** NOT CHECKED.
- **DPP Storage objects restored:** NOT CHECKED.
- **E0.2 BACKUP & RESTORE READY:** **BLOCKED / YELLOW**, do not label 100% GREEN.

**Official reference:** [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups). Daily backups are provided for qualifying plans; Restore interrupts project access and Storage bytes require separate handling.

## E0.2 executed after this document was created — restoration evidence tooling

- Built `tools/engine/dpp_archive_check.py`: safe local-only structural inspection of an **existing logical PostgreSQL custom-format archive** using `pg_restore --list` (no production connection, no restoration). It checks required DPP table data and, in strict mode, `auth.users`, and **never** claims restored data or Storage bytes are GREEN. This tool does **not** inspect Supabase managed physical backups.
- Added `tests/engine/test_dpp_archive_check.py` with **11 automated negative and positive test cases**, including missing auth, missing passport versions, corrupt archive, symlink rejection and prevention of false recovery GREEN. GitHub **DPP Stage1 Engine Regression run 37805644006 SUCCESS** at commit `23f73866f31a51d20178522cfe29d51e322abb76`; tests were also run locally in isolated Python.
- Added `tools/engine/dpp_restored_database_readonly.sql` for aggregate-only schema/row integrity verification **after** a real isolated restore. It runs `BEGIN TRANSACTION READ ONLY` and returns no personal/customer row content; it explicitly cannot prove Storage object restoration.
- Captured one-query production **metadata-only**, no-PII baseline at **2026-10-08 16:03:30 UTC** in `data/dpp-stage1-readonly-baseline-2026-10-08.json`. It records DPP counts, schema fingerprint and orphan checks; this is **not a data backup and must not be compared to a different restore point as if it were**.
- Live schema dependency audit shows `dpp_*` tables reference **`auth.users` and `public.leads`** as external foreign keys. A partial DPP-only archive omitting these relations may fail restore or lose essential authorization provenance. Use provider restore-to-new-project on qualifying paid physical-backup projects, or carefully staged protected logical backup.
- Live `archive_mode=on`, `wal_level=logical`, `data_checksums=on` confirm PostgreSQL server configuration **only**. These values do **not** prove a particular managed backup exists or that PITR retention is enabled.
- The Supabase connector has no managed-backup listing or isolated restore action. Provider actual backup timestamps, a newly restored separate project, and Storage byte recovery remain **UNVERIFIED**.
- **Stop rule unchanged:** E0.2 remains YELLOW/BLOCKED before live DDL; these new tools are structural/preflight gates, not a completed full-data restore.

See Supabase official [Database Backups](https://supabase.com/docs/guides/platform/backups) and [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project). The clone may incur additional expense and still requires separate Storage object configuration and bytes.


## E0.2 strict archive preflight hardening — 2026-10-08

After independent inspection of the real database dependency graph, the first archive checker was found to validate only **12** representative DPP tables. That could misleadingly report a structural PASS for an incomplete logical archive missing other DPP tables. This has now been corrected:

- The archive checker requires **TABLE DATA entries for all 46 existing DPP tables**, rather than 12 selected tables.
- In strict whole-project mode it additionally requires `auth.users` (identity FK), `public.leads` (external DPP partner FK), and `storage.objects` (Storage metadata only), totaling **49 table-data entries**.
- A partial DPP-only archive can still be inspected explicitly, but is always marked `partial_archive_mode=true` and `recovery_gate_green=false`.
- Distinct tests now reject absent `public.leads`, absent Storage metadata, absent minor DPP tables and superficially present schema-only table entries. There are now **16 isolated regression test cases**.
- GitHub regression run **37814484534** succeeded on commit `061bab592f311de5f6d1b16545d2f51282bd5ba5`.
- **No backup file, database rows or Storage object bytes were exported, restored or made public.** This remains an improved screening test, not a real restored-backup acceptance.
