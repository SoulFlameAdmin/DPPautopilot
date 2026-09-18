# T08 — Reliability / Retry Test Progress

Status: **PARTIAL — master task remains RED**

This dependency-safe suite covers the already-GREEN M15/M16 registry workflow:

- synthetic timeout metadata is recorded
- `submitted -> retry_wait -> queued -> submitted` retry path succeeds
- every transition into `submitted` increments `attempt_count`
- successful retry reaches `accepted` and records `accepted_at`
- terminal `accepted` state rejects an invalid return to `retry_wait`

During defer cycle 1, the runtime test exposed a real defect: a second submission attempt remained at `attempt_count=1` because the trigger increment was incorrectly coupled to `submitted_at is null`. Migration `20260919002000_dpp_registry_retry_attempt_fix.sql` corrects that behavior while preserving the first `submitted_at` timestamp.

T08 is **not GREEN** yet because M23 idempotency/concurrency is still RED. The M23 portion of reliability acceptance must be implemented and added before T08 can become GREEN.

## Evidence — defer cycle 1

- Bound Supabase runtime test first exposed a real defect: after synthetic timeout and retry, `attempt_count` remained 1 instead of 2.
- Migration `20260919002000_dpp_registry_retry_attempt_fix.sql` was applied successfully to project `frhletkiuupgksmgxoxc`.
- The corrected runtime retry test returned `T08_REGISTRY_RELIABILITY_SUBSET_PASS` inside an explicit rollback transaction.
- GitHub Actions run `35395905409` on commit `20040c3d25a02a0a029731d51a016b9b657af672`: `Run T08 registry reliability subset` PASS after clean PostgreSQL 17 migration replay.
- T08 remains RED because M23 idempotency/concurrency is still RED.

## Evidence — versioned reliability matrix

- `data/reliability-test-matrix.json` links registry timeout/retry, import duplicate-commit idempotency and registry duplicate-submission idempotency.
- `scripts/validate_reliability_matrix.py` fails CI if a declared executable test or PASS marker disappears.
- `Validate T08 reliability matrix` PASS in full GitHub Actions run `35398504301`.
- T08 remains RED while master M23 is RED.

