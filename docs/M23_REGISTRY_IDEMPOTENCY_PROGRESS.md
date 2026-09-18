# M23 — Registry Submission Idempotency Extension

Status: **PARTIAL — master task remains RED**

This slice extends M23 coverage over the already-GREEN M15/M16 registry workflow.

Implemented:

- optional `idempotency_key` on registry submissions
- unique scope: organization + provider + environment + idempotency key
- `dpp_create_registry_submission(...)` for safe idempotent creation
- exact duplicate request returns the existing submission with `already_exists=true`
- reuse of the same key with different item/passport/payload fails closed
- no client role execution grant is introduced

A pre-fix runtime probe proved that duplicate registry submissions with identical request data could be inserted as separate rows.

M23 remains RED because M17-M19 are still RED; API-level duplicate/conflicting write behavior must still be implemented and covered.

## Evidence — registry idempotency slice

- Pre-fix bound Supabase probe proved two semantically identical registry submissions could be inserted as separate rows.
- Migration `20260919004000_dpp_registry_submission_idempotency.sql` was applied successfully to bound project `frhletkiuupgksmgxoxc`.
- Sequential rollback test returned `M23_REGISTRY_IDEMPOTENCY_SUBSET_PASS`.
- A true two-session parallel create with the same idempotency key returned the same `submission_id`: one call `already_exists=false`, the other `already_exists=true`.
- Verification returned `M23_REGISTRY_PARALLEL_VERIFY_PASS`; exactly one registry submission existed and reuse of the same key with a different payload was rejected.
- The synthetic registry submission was removed after the probe. The synthetic org itself cannot be cascade-deleted through normal SQL because immutable passport version history correctly rejects destructive deletion; this is deferred to future R08 retention/deletion semantics rather than bypassed.
- GitHub Actions run `35397635051` on commit `055cbba9d44296f4653bf28f5e90f55186c221ab`: full workflow SUCCESS, including clean PostgreSQL 17 replay, `Run M23 registry idempotency subset`, all prior DB gates and browser smoke. Artifact: `10569016076`.

