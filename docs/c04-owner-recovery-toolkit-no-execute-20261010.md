# C04 owner recovery toolkit — NO EXECUTE

Status: Draft planning/tooling only. C04 remains RED.

This toolkit supports the two-phase recovery evidence model agreed for Issue #318. It does not connect to Supabase and does not run `pg_dump`, Supabase CLI, S3/Storage download, restore, migrations, merge, deploy, or snapshot refresh.

## Why this exists

The bound project `frhletkiuupgksmgxoxc` is on Supabase Free and current read-only evidence does not prove a provider backup/PITR restore point. The project is shared by DPP and other SoulFlame applications. Current live inventory is 12 Storage buckets and 98 metadata object records, while all ten proposed DPP C04 migrations are still absent. Therefore recovery evidence must be created owner-side and kept private.

## Owner inputs required before any real drill

1. Owner confirms Dashboard > Database > Backups state and records metadata only. If no provider backup exists, owner selects an approved logical export method from a trusted machine.
2. Owner selects a protected encrypted destination for the database artifact and a separate protected destination for actual Storage object bytes.
3. Owner provisions or approves an isolated restore target with different credentials and production callbacks/webhooks/email/payment integrations disabled.
4. Owner identifies the authorized operator who may read production data for backup purposes.
5. Owner approves any paid sandbox/resource before it is created.

Never place connection strings, JWTs, private object names, raw customer data, or private backup artifacts in GitHub, CI artifacts, issue comments, or email.

## Local toolkit commands

All commands below operate only on local files already supplied by the authorized owner/operator.

```text
node scripts/c04-owner-recovery-toolkit.mjs plan
node scripts/c04-owner-recovery-toolkit.mjs migration-manifest supabase/migrations .c04-private/migration-sha256.json
node scripts/c04-owner-recovery-toolkit.mjs file-sha256 <encrypted-db-artifact>
node scripts/c04-owner-recovery-toolkit.mjs bytes-manifest <local-storage-export-root> .c04-private/storage-bytes.json
node scripts/c04-owner-recovery-toolkit.mjs verify-bytes .c04-private/storage-bytes.json <isolated-restored-storage-root>
```

The `.c04-private/` directory is intended for local private evidence and must never be committed.

## Phase A — baseline isolated recovery

Target marker: `BASELINE_RECOVERY_PASS`.

The source is the real current pre-migration state. Record DB and Storage capture start/end UTC independently and explain the consistency delta. A successful Phase A requires:

- encrypted DB artifact bytes + SHA-256 + protected reference;
- actual Storage object bytes, not only `storage.objects` rows;
- private Storage checksum manifest and exact object/byte counts;
- isolated DB restore with Auth/FK/dependency checks;
- baseline RLS/RBAC/RPC checks reflecting the source state, not post-migration expectations;
- isolated Storage restore with checksum and ACL verification;
- measured restore start/end UTC and source-to-backup recovery point delta.

If uploads or writes occur between DB and Storage captures, record and reconcile the delta. Do not claim atomicity unless it is proven.

## Phase B — isolated migration rehearsal

Target marker: `MIGRATION_REHEARSAL_PASS`.

Create a clone/copy of the successful Phase A isolated environment. Freeze the exact candidate Git SHA and migration SHA-256 manifest, then apply all ten migrations in timestamp order only to the isolated clone. Phase B requires:

- ten expected migration files exactly matching the frozen checksum manifest;
- A2 actor-bound idempotency and wrong-actor DP409 checks;
- tenant isolation, RLS and RBAC checks;
- exact authenticated/anon RPC exposure checks;
- `SECURITY DEFINER` fixed `search_path` checks;
- passport/QR identity checks;
- Storage-byte integrity re-check after rehearsal;
- exact-SHA regression links and measured rehearsal duration.

Any candidate code or migration content change invalidates Phase B evidence and requires a new run.

## STOP conditions

Stop and keep C04 RED if any of the following is true:

- provider backup/PITR state is unknown and no approved logical export exists;
- database artifact checksum/size is missing;
- Storage actual bytes were not exported;
- private Storage checksum manifest is missing;
- baseline restore was not performed in isolated infrastructure;
- Phase A baseline expectations are mixed with post-migration expectations;
- any of the ten migrations differ from the frozen checksum manifest;
- Phase B migration rehearsal is not fully green;
- RPO/RTO/restore duration are estimated instead of measured;
- production approval is not explicit for the exact candidate SHA and maintenance window.

## Production boundary

Passing this toolkit does not authorize production. The owner must separately approve the exact candidate SHA, maintenance window, migration operation and rollback/forward-fix decision after reviewing the complete protected evidence package. Snapshot refresh remains downstream of authoritative live migration evidence.
