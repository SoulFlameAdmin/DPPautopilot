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
