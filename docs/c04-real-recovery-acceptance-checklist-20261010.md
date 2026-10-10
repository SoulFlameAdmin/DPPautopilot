# C04 real DB + Storage recovery acceptance checklist — NO APPLY

Date: 2026-10-10
Status: Draft / recovery evidence checklist only
Bound project: `frhletkiuupgksmgxoxc`
Related: Issue #318, Draft PR #332

## Safety boundary

This checklist does **not** authorize production SQL, migration application, snapshot regeneration, merge, deploy, or release. It defines the minimum evidence required before a separate production approval can even be requested.

The isolated PostgreSQL 17 `pg_dump`/`pg_restore` drill in PR #330 proves the recovery mechanism against synthetic data only. It is **not** proof that the real bound-project database and private Storage bytes are recoverable.

Owner-side read-only evidence on 2026-10-10 reported 470 migration records with all 10 current DPP C04 migration names absent. That observation keeps C04 RED; it does not replace a retained authoritative export/evidence package.

## PASS rule

`C04_REAL_RECOVERY_PASS` may be recorded only when **every mandatory item below has independent evidence**. Any missing, unverifiable, stale, or mismatched item is FAIL-CLOSED.

## A. Database backup artifact

Mandatory:

- [ ] Backup source is identified: provider-managed backup/PITR **or** encrypted logical export.
- [ ] Source project/ref and restore point/timestamp are recorded without exposing secrets.
- [ ] Backup creation start/end timestamps are recorded.
- [ ] Backup artifact byte size is recorded.
- [ ] Cryptographic checksum of the backup artifact is recorded.
- [ ] Encryption-at-rest/protected-location method is recorded.
- [ ] Required dependencies are included or separately captured: application schema/data, `auth.users` dependencies required by DPP FKs, `public.leads` or other external referenced rows where applicable, migration metadata needed for reconciliation, and required role/ACL metadata.
- [ ] A second reviewer can identify the exact artifact from the evidence without receiving credentials or raw personal data.

FAIL if the only evidence is a migration replay, schema-only export, TOC listing, dashboard screenshot without restore point, or synthetic CI database.

## B. Storage byte backup artifact

Mandatory:

- [ ] Every DPP-relevant Storage bucket is inventoried at the same logical recovery point as closely as operationally possible.
- [ ] Actual object **bytes** are backed up, not only `storage.objects` metadata.
- [ ] Per-bucket object count is recorded.
- [ ] Per-bucket total byte count is recorded.
- [ ] Integrity evidence exists for restored objects (per-object hashes where practical, otherwise a protected manifest with deterministic hashes/size checks).
- [ ] Private object contents, signed URLs, service keys, JWTs and PII are not committed to GitHub or emailed in plaintext.
- [ ] Backup location and access control are recorded without leaking credentials.

FAIL if only bucket names, object rows, declared metadata size, or synthetic objects are available.

## C. Isolated database restore

Mandatory:

- [ ] Restore target is isolated from the shared production project.
- [ ] Exact backup artifact/checksum from section A is restored.
- [ ] Restore start/end timestamps and duration are recorded.
- [ ] Restore completes without ignored fatal errors.
- [ ] Expected schemas/tables/functions exist after restore.
- [ ] Representative row counts and referential-integrity checks match the source evidence within an explicitly explained recovery-point delta.
- [ ] Required auth/external FK dependencies restore successfully.
- [ ] Migration registry/state is captured read-only after restore.
- [ ] No production credentials are embedded in CI logs or repository artifacts.

## D. Isolated Storage restore

Mandatory:

- [ ] Storage bytes from section B are restored to an isolated target/location.
- [ ] Bucket/object counts match the protected source manifest.
- [ ] Total bytes match or any delta is explicitly explained.
- [ ] Integrity/hash checks pass for the restored object set.
- [ ] Private/public access classification is preserved or intentionally tightened.
- [ ] A representative private object remains inaccessible without authorized access.
- [ ] A representative permitted object can be read through the intended authorized path.

## E. Post-restore DPP security/integrity verification

Run against the restored isolated environment, not production:

- [ ] Tenant isolation negative tests PASS.
- [ ] RLS/RBAC policy checks PASS.
- [ ] Sensitive `SECURITY DEFINER` functions have the expected fixed `search_path`.
- [ ] Expected authenticated RPC grants are present.
- [ ] `anon EXECUTE` is absent on RPCs that must fail closed.
- [ ] A2 `*_unbound` inner CAS functions are not executable by API roles.
- [ ] Actor-bound request-id replay/cross-actor DP409 tests PASS.
- [ ] Organization onboarding/ensure dependencies are consistent.
- [ ] Representative item/passport identity survives restore.
- [ ] Public QR/passport identity is validated only with non-sensitive test identities; no claim of physical-device acceptance is made from DB checks alone.

## F. Recovery objectives and rollback evidence

Mandatory:

- [ ] Measured database restore duration is recorded.
- [ ] Measured Storage restore duration is recorded.
- [ ] Total measured recovery duration is recorded.
- [ ] Actual achievable RPO is stated from the chosen backup method and restore point.
- [ ] Actual measured/defensible RTO is stated from the isolated exercise.
- [ ] Rollback decision owner is named by role/account, not inferred.
- [ ] Rollback steps identify which artifact/checksum would be restored and where.
- [ ] Security migrations are not automatically "rolled back" by re-granting unsafe permissions; forward-fix is preferred unless explicit security approval says otherwise.

## G. Evidence package required before production approval request

Provide one concise record containing:

`candidate SHA | live read-only migration export/ref | DB backup restore point | DB backup checksum+bytes | Storage manifest ref | Storage count+bytes+integrity result | isolated DB restore target/ref | isolated Storage restore target/ref | restore durations | RPO | RTO | RLS/RBAC/RPC test results | rollback artifact/ref | independent reviewer | approval owner`

The evidence package may reference protected artifacts; it must not contain secrets, raw tokens, private object contents, credentials, or unnecessary personal data.

## STOP conditions

Keep **C04 RED** and do not request production migration approval if any of the following is true:

- real DB backup artifact is unproven;
- actual Storage bytes are not backed up;
- either DB or Storage has not been restored in isolation;
- restored integrity/access checks are incomplete;
- source and restore-point identity cannot be tied to exact artifacts/checksums;
- RPO/RTO are guessed rather than measured/derived from evidence;
- migration candidate SHA changed after the dry-run evidence;
- explicit owner approval is missing.

Only after this checklist is fully evidenced should the team request a **separate** decision about production SQL. Passing this checklist alone does not authorize execution.
