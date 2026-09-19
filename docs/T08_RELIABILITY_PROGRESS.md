# T08 Reliability / Retry Test — Partial Progress

T08 remains **RED** because M23 is not fully accepted.

The current reliability precursor covers four executable scenarios:

- registry timeout → `retry_wait` → resubmission → accepted terminal state;
- duplicate import commit idempotency with no duplicate model/item creation;
- registry submission idempotency, including same-key/same-payload no-op and same-key/different-payload rejection;
- M17/M18/M19 API write conflicts mapping to stable 409 responses while unexpected DB errors fail closed.

`scripts/generate_reliability_report.py` validates the versioned scenario matrix, every referenced executable test/marker and required retry/idempotency/conflict behaviors, then writes `artifacts/t08-reliability-report.json`.

The three PostgreSQL reliability/idempotency subsets are also suitable for bound-Supabase rollback execution. T08 must remain RED until M23 is GREEN and the full declared dependency acceptance is complete.

## Evidence — current reliability report

- GitHub Actions run `35412453600` on `7c0aaec92f1fe958c6734eb2ff5474ca1015966e` completed SUCCESS.
- `Generate T08 reliability coverage report`, registry retry, import idempotency, registry idempotency and API conflict/fail-closed checks all passed.
- Artifact `10574529645` contains `artifacts/t08-reliability-report.json` with the workflow evidence bundle.
- Bound Supabase project `frhletkiuupgksmgxoxc` executed the three PostgreSQL reliability/idempotency suites inside one `BEGIN/ROLLBACK` transaction and returned `T08_BOUND_SUPABASE_RELIABILITY_ROLLBACK_PASS`.
- T08 remains RED while M23 remains RED.
