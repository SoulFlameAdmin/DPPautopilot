# R10 Monitoring / Alerting — Partial Progress

R10 remains **RED** because R09 is not yet GREEN and live alert delivery/retention acceptance is still missing. Deployed structured-event ingestion is now evidenced, but this precursor does not claim live alert notification delivery.

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

## Synthetic fire/recover incident drill

- `data/monitoring-incident-drill.json` and `tests/api/monitoring-incident-drill.test.cjs` drive a deterministic critical availability scenario through the real R10 evaluator.
- 20 valid R09 events with one 503 produce exactly 5% 5xx and fire `availability_5xx_rate` as critical for the DPP operations owner.
- The drill maps that signal to R13 `SEV1`, proves the synthetic acknowledgement timestamp (5 minutes) is within the 15-minute target, exercises every required runbook phase in order, then advances beyond the 5-minute window and proves the alert clears on healthy traffic.
- The test emits `artifacts/r10-r13-monitoring-incident-drill.json`. This is CI evidence only; it does not claim live delivery, human acknowledgement or production recovery.

## Deployed ingestion evidence — 2026-09-22

- Vercel runtime error aggregation returned a real production `dpp_http_request` event from deployment `dpl_EiGGtCSHLr18wArzAsjQpje63zDu`.
- The event carried the R09 shape: `surface=passport`, `method=GET`, `status=500`, `outcome=server_error`, `auth_present=false`, `error_code=SERVER_CONFIGURATION_MISSING`.
- This proves structured R09 event ingestion existed on a production deployment. It does **not** prove current production health, live alert delivery, accepted retention/backend ownership, or human acknowledgement.
- F08 is already GREEN and is no longer listed as an R10 runtime blocker.

## Remaining before GREEN

No notification destination is claimed as live. Production acceptance still requires an approved alert destination, accepted production logging retention/backend ownership, a real alert fire-and-recover notification drill, and acknowledgement/escalation evidence.
