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
