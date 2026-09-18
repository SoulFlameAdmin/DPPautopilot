# M23 — Idempotency / Concurrency Progress

Status: **PARTIAL — master task remains RED**

This dependency-safe slice covers the already-GREEN M20 transactional import flow.

Implemented:

- `dpp_commit_import(uuid)` keeps its existing `FOR UPDATE` row lock, serializing commits for the same import run.
- a repeated commit of an already committed import is now a verified no-op instead of a constraint error.
- repeated commit returns `already_committed=true` and the original committed row count.
- before returning the idempotent result, the function checks that every expected import row has both committed model/item links; inconsistent state fails closed.
- regression coverage verifies one model, one item and one row linkage after two commit calls.

The runtime probe before the fix proved the old behavior returned a check-violation on the second commit.

M23 is **not GREEN** yet because its declared dependencies M17-M19 are still RED. API-level duplicate-write/idempotency and conflicting-write concurrency rules must be implemented and tested before the master task can become GREEN.

## Evidence — defer continuation

- Pre-fix bound Supabase probe proved the old duplicate-commit behavior failed on the second commit with a check violation.
- Migration `20260919003000_dpp_import_commit_idempotency.sql` was applied successfully to bound project `frhletkiuupgksmgxoxc`.
- Sequential runtime test returned `M23_IMPORT_IDEMPOTENCY_SUBSET_PASS` inside an explicit rollback transaction.
- A real two-session parallel commit probe against one validated synthetic import produced exactly one real commit (`already_committed=false`) and one serialized idempotent no-op (`already_committed=true`); no duplicate model/item state was created. Synthetic probe data was removed afterwards.
- GitHub Actions run `35396707595` on commit `dd5bcdd0277c5998d356dfbc4be58dc130388c0d`: full workflow SUCCESS, including `Run M23 import idempotency subset`, clean PostgreSQL 17 migration replay and browser smoke. UI artifact: `10567419725`.
- M23 remains RED because M17-M19 are still RED and API-level duplicate/conflicting write behavior is not yet available to test.

