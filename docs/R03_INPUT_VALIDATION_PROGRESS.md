# R03 — Input Validation Progress

Status: **PARTIAL — master task remains RED**

R03 now has two evidence-backed dependency-safe layers:

1. M20 database/import boundary negative validation.
2. M17-M19 serverless API body/field validation.

## Covered negative cases

Database/import boundary:

- negative import counters
- non-positive staged row numbers
- non-object normalized model/item JSON
- non-array validation error payloads
- disallowed battery category/lifecycle values
- model identifiers longer than 128 characters
- battery unique identifiers longer than 300 characters

Serverless/API boundary:

- string, Buffer and already-parsed object bodies above 1 MiB reject with HTTP 413 `PAYLOAD_TOO_LARGE`
- malformed JSON and unserializable bodies reject with HTTP 400 `INVALID_JSON`
- model/item/passport invalid IDs, categories/statuses, field lengths and JSON shapes reject locally
- oversize/malformed requests are rejected before any Supabase upstream call
- M17-M19 use one shared `api/_request.js` limiter so parsed-object bodies cannot bypass the size check
- the 413 behavior is part of the canonical M22 API error contract
- M13 evidence metadata policy remains versioned at 10 MiB with allowed content types, storage-path rule and SHA-256 format

## Evidence — 2026-09-19

- Bound Supabase M20 rollback suite: `R03_M20_INPUT_VALIDATION_SUBSET_PASS`.
- Prior full CI `35398725407`: M20 negative DB subset PASS.
- Full CI `35407365035` on `146c2d90f3ca9f1fcc4f6b0b1c6ad9184c00b6ea`: SUCCESS.
- CI step `Validate R03 API input validation contract`: PASS.
- CI step `Run R03 API payload negative suite`: PASS.
- Clean PostgreSQL 17 replay, R03 M20 DB negative suite, R04/RLS/RPC security gates and browser smoke: PASS.
- `data/api-input-validation-matrix.json` versions the current 10 negative API/file-policy scenarios.

R03 remains RED until M13 real storage upload/download validation and the dependent M17-M20 production/API flows are fully accepted and exercised end-to-end.
