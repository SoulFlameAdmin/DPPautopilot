# T02 — Database Integration Suite Progress

Status: **PARTIAL — master task remains RED**

This suite intentionally covers only database capabilities whose upstream master-plan tasks are already GREEN:

- M04 core schema and constraints
- M06 ordered clean migration replay
- M07 saved CSV mappings and revision tracking
- M11 immutable passport version history
- M14 identifier/lifecycle enforcement
- M15/M16 registry workflow and status transitions
- M20 transactional import validate/commit path
- deny-by-default client table grants

The suite runs against the clean PostgreSQL 17 database produced by the canonical migration replay in CI. It creates only synthetic rows and fails on any regression in the covered contracts.

T02 is **not GREEN** yet because its declared dependency range M04–M16 still includes RED M05 (RLS tenant policies), M10 (public/private API enforcement), M12 (critical audit log), and M13 (evidence attachments). Those must be implemented and added to this suite before T02 can satisfy its full acceptance criteria.

## Evidence — defer cycle 1

- GitHub Actions run `35395443843` on commit `78d8de7e344ca175f9b74f758c3b395ace972c6e`: full workflow SUCCESS; step `Run T02 green database subset integration suite` PASS.
- UI regression artifact: `10567128302`.
- The same SQL integration suite was executed against the bound Supabase project `frhletkiuupgksmgxoxc` inside an explicit transaction and returned `T02_GREEN_DB_SUBSET_PASS`; the transaction was rolled back, leaving no synthetic test rows.
- T02 remains RED because M05/M10/M12/M13 are still RED and are explicitly outside this partial suite.

