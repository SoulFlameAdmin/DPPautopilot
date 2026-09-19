# R10 Monitoring / Alerting — Partial Progress

R10 remains **RED** because it depends on R09, which still lacks deployed runtime evidence. This precursor defines and tests alert logic without claiming live alert delivery.

## Signals and ownership

All signals evaluate R09 `dpp_http_request` events in a rolling 5-minute window.

| Signal | Threshold | Severity | Owner |
| --- | --- | --- | --- |
| API 5xx rate | ≥ 5% with at least 20 requests | Critical | DPP operations owner |
| Consecutive 5xx | ≥ 5 consecutive server errors | Critical | DPP operations owner |
| p95 latency | ≥ 2000 ms with at least 20 requests | Warning | DPP platform owner |
| Auth failure rate | ≥ 30% stable auth/role error codes with at least 20 requests | Warning | DPP operations owner |
| Rate-limit pressure | ≥ 20% `RATE_LIMITED` with at least 20 requests | Warning | DPP platform owner |

Each signal also defines a lower clear threshold to avoid treating the fire threshold as the recovery target.

## Executable precursor

- `api/_monitoring.js` validates R09 events, restricts evaluation to the 5-minute window, computes ratios/p95/consecutive failures and returns deterministic alert state.
- `tests/api/monitoring-alerts.test.cjs` proves trigger and clear/non-trigger behavior, minimum-sample guards, time-window exclusion and malformed-event rejection.
- R09 now includes `timestamp_ms` in each structured request event so the window calculation is part of the real event contract rather than depending on an unstated external timestamp.

## Remaining before GREEN

No notification destination is claimed as live. Production acceptance still requires deployed R09 log ingestion, an approved alert destination, a real alert fire-and-recover drill, and acknowledgement/escalation evidence. F08 is not retried by this precursor.
