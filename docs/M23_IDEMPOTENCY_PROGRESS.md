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
