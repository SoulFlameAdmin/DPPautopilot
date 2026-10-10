# C04 owner-side recovery: two-phase runbook (NO APPLY)

Date: 2026-10-10
Status: Draft / operator instructions only
Related: Issue #318; upstream Draft PR #332; security Draft #331; isolated DB regression #330
Bound Supabase project: `frhletkiuupgksmgxoxc` (`soulflame-twins`)

## 0. Non-negotiable boundaries

- This project is shared with non-DPP workloads; a DPP-only table dump is **not** sufficient evidence of safe whole-project recovery.
- **NO** production SQL, migration apply, production restore, branch merge, deploy, bound-snapshot regeneration, DPP release, or paid resource provisioning is authorized by this runbook.
- Do **not** press Supabase Dashboard "Restore" on the bound project: that action can take the project offline and restore its data.
- Never send DB exports, object bytes, service-role tokens, JWTs, DB connection strings, passwords, signed URLs, private object names, or personal information to GitHub, CI logs, email, or the public issue.
- Only trusted owner-operated local/isolated export tooling may access live data; log metadata and opaque protected evidence references only. Require a separate explicitly approved, cost-aware isolated destination **before** any restore.
- Any plan/tooling below must be reviewed on the installed CLI version (`supabase --help`, `supabase db dump --help`, `pg_dump --help`, `pg_restore --help`), not executed on the live project blindly.
- Source observation on 2026-10-10: 470 live migration records; none of the ten C04 proposed DPP migration names observed. This is **point-in-time inventory**, not approval or proof that anything was installed. Export exact migration evidence again at change time.
- Main CI C04 is the release gate and remains RED until real evidence and an independent owner decision. Successful synthetic PG17 `pg_dump/pg_restore` in #330 proves mechanism, **not** source DB/Storage recoverability.

## 1. Identify backup capabilities without changing production

Owner uses Supabase Dashboard > Database > Backups **view-only** to record:
- project ref; plan tier, whether daily backup or PITR is enabled;
- last available source backup / restore point, UTC; retention, expiration, and whether a download is actually possible;
- private screenshot/reference containing *metadata only* (sanitized if necessary).

Do not assume a provider-managed backup exists because `get_project` reports ACTIVE_HEALTHY. Supabase documentation says daily managed backups depend on plan; Free projects are advised to export data. Provider DB backups include Storage *metadata*, not the actual Storage object bytes.

Authoritative docs (check before executing):
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/storage

**STOP:** if backup availability cannot be verified, record `DB_BACKUP_SOURCE_UNVERIFIED`. A provider restore into the *live* source is forbidden under this runbook.

## 2. Read-only preflight and consistency strategy

With approved least-privilege credentials, from an owner-controlled environment:
1. Capture source UTC time, project identity, Postgres version, current migration inventory, and schema/extension/role/ACL dependencies; store the detailed export privately.
2. List Storage buckets and object inventories using authorized Storage metadata/listing mechanisms; identify all DPP-relevant buckets **and** dependencies from shared services. Do not infer object bytes from `storage.objects` metadata.
3. Record source baseline counts/constraints/FKs for required DPP tables, plus `auth.users` dependencies and shared tables such as `public.leads` where actually referenced. Retain sensitive row-level evidence privately.
4. Capture approximate DB/Storage freeze or watermark times. If source writes continue, DB and Storage may represent different recovery points. Log the inconsistency window and reconcile object inventories/changed rows after backup. Never call this an atomic snapshot without evidence.
5. Confirm encryption, access controls, TTL/retention, protected destination, backup operator, independent reviewer, and capacity/cost approval.
6. Determine exact **existing** data recovery method: downloadable provider logical backup, or *read-only logical export* to owner-controlled encrypted backup. A schema-only or synthetic dump is not adequate.

Do not run new functions/DDL on the production database to collect evidence. Private source data must not appear in public PR output.

## 3. Phase A — real source baseline backup and isolated restore

**Goal:** prove that the CURRENT source state (before ten proposed migrations) can be recovered, including actual Storage object bytes. This stage does **not** expect proposed A2 tables, actor-bound CAS, or post-hardening search_path to exist.

A. Produce a real encrypted **DB** backup artifact (not merely a SQL migration replay) and privately record immutable artifact reference, backup start/end UTC, recovery point UTC, SHA-256, size, encryption method, required auth/role/dependency coverage. Prefer a consistent transaction snapshot or document limitations.

B. Produce a separate encrypted **Storage bytes** backup at a clearly identified logical point. Privately record bucket/object inventory, total counts/bytes, protected integrity/hash manifest, time-window and consistency delta. The DB backup's `storage.objects` entries alone are **not** the bytes. If authoritative source inventory proves zero relevant object bytes, record **ZERO_OBJECT_SOURCE_VERIFIED** and demonstrate empty-state reconciliation; do not claim a nonzero object restore test occurred.

C. Restore **both** artifacts into a new isolated target with isolated credentials, private networking/access, disabled outgoing callbacks/webhooks/schedulers/integrations, and **no live production endpoints, payments, or tokens**. Do not do a provider-managed restore into the bound production project.

D. Verify actual DB restoration: schema/functions, auth/FK requirements, sample counts, baseline tenant/RLS/RBAC/ACL, constraints, relevant item/passport identifiers. Independently verify Storage restored bytes against the source manifest and private/public authorization, accounting for legitimate recovery-point deltas.

E. Record start/end UTC, measured DB and Storage restore durations, completeness/errors, exact artifact SHA-256, actual source recoverability point; compute RPO as the age of recoverable data at the incident/test reference time (state reference), and RTO from a **measured end-to-end restore**. Distinguish target RPO/RTO from observed measurements.

**PHASE_A_REAL_BASELINE_RECOVERY_PASS** requires independent documentary evidence of A–E. An unchecked form, fictitious path, metadata-only bucket list, synthetic data, or failing restored permissions is FAIL.

## 4. Phase B — migrations rehearsed only on an isolated restored copy

**Goal:** prove the ten proposed C04 migrations work on a copy of the **real Phase A baseline**, not merely on fresh synthetic PostgreSQL.

- Create a second disposable isolated clone/snapshot from the verified Phase A target. Confirm no connection is capable of reaching the bound production DB. Never run proposed migrations on source.
- Freeze exact candidate Git commit SHA and SHA-256 of the ten migration files. Compare against #332 dependency order and verify all prerequisites.
- Apply the ten proposed migrations **to isolated clone only**, in canonical timestamp order, with a full log, timings, and failure/rollback handling. Exact sequence is specified in `docs/c04-migration-change-plan-20261010.md`; do not reorder it here.
- Check after-migration objects and permissions, including: A2 actor-bound CAS for two users in one organization (same-actor replay accepted; cross-actor same request ID => DP409); internal `*_unbound` functions inaccessible to API roles; expected `SECURITY DEFINER` fixed search_path; sensitive RPC `anon EXECUTE=false`; onboarding truthfulness; tenant/RLS/RBAC/integrity; DB + Storage references and QR identity after migration.
- Run regression matrix on **the exact frozen candidate SHA**. Any source SHA/migration checksum change requires rerun. A green isolated test does not waive the real backup/restore or staging/physical tests.

**PHASE_B_ISOLATED_MIGRATION_REHEARSAL_PASS** requires exact target, candidate SHA, checksums, migration outputs, every security test, reviewer and evidence reference. It cannot be PASS if Phase A is FAIL.

## 5. Acceptance and STOP rules

Independent QA may record **READY_FOR_OWNER_RELEASE_REVIEW** only if both Phase A and Phase B independently pass, live read-only migration/source-catalog reconciliation is current, test SHA matches the candidate, the rollback/forward-fix plan is documented, downtime/cost and source data impact are understood, and the evidence is inspectable without leaking data.

Even READY_FOR_OWNER_RELEASE_REVIEW:
- is **not** C04 production PASS;
- is **not** authorization to apply migrations;
- is **not** proof of public/staging/phone/physical QR golden-path E2E;
- does **not** justify a migration snapshot edit or deploy.

Owner (Mitko) must separately approve the **specific** migration candidate SHA, explicit SQL scope, change window and rollback plan; until then, C04 stays RED. After any separately approved application, confirm live registry/catalog/ACL, THEN regenerate snapshot from authoritative live evidence and rerun CI. Physical phone/QR E2E remains independent.

## 6. Sanitized evidence handoff

Use `docs/c04-owner-recovery-evidence-template-20261010.json`. Fill metadata only; opaque protected references should grant no access by themselves. Do not mark unknown values as 0 or invent dates/SHA. Store source backups and raw private manifests in an encrypted owner-controlled location.

Minimum record: source project/ref and UTC inventory; backup kind/UTC/checksum/size/protected reference; Storage protected manifest/count/bytes/UTC; Phase A target+measured restore; Phase B target+ten migration/test evidence+exact SHA; RPO/RTO and consistency delta; reviewer; owner-specific pending approval.

Until the actual owner-run operation occurs, both phases are **NOT_EXECUTED** and C04 remains RED.
