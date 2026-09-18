# R03 — Input Validation Progress

Status: **PARTIAL — master task remains RED**

This dependency-safe slice covers only the already-GREEN M20 database import boundary. It does not claim the full server/file/API validation required by R03.

Negative regression coverage proves rejection of:

- negative import counters
- non-positive staged row numbers
- non-object normalized model/item JSON
- non-array validation error payloads
- disallowed battery category values
- model identifiers longer than 128 characters
- disallowed lifecycle status values
- battery unique identifiers longer than 300 characters

The suite runs inside a transaction/rollback against the bound Supabase project and on clean PostgreSQL replay in CI.

R03 remains RED until M13 and M17-M20 are complete and malformed/oversize/disallowed file and API payloads are covered end-to-end.

## Evidence — 2026-09-19

- Bound Supabase project `frhletkiuupgksmgxoxc`: explicit transaction/rollback suite returned `R03_M20_INPUT_VALIDATION_SUBSET_PASS`.
- GitHub Actions run `35398725407` on `d6b6b3b491862db0f7e763f160e0afc4e0383ece`: SUCCESS.
- CI step `Run R03 M20 negative input validation subset`: PASS after clean PostgreSQL 17 migration replay.
- Standard browser smoke also PASS; artifact `10569002388`.
- Master R03 remains RED until M13 and M17-M20 server/file/API negative validation are complete.

