# R09 Logging / Observability — Partial Progress

R09 remains **RED** because M17–M19 are not yet fully accepted and production logging-backend/retention evidence is still missing. F08 and M20 are already GREEN, so they are no longer runtime blockers.

## Repository-level precursor

- Every current serverless API surface starts correlation before rate limiting/authentication: tenant, organizations, members, models, items, passport, imports and export.
- A safe incoming `X-Request-ID` is echoed; missing or invalid IDs are replaced with UUID v4.
- Every completed request emits one JSON event named `dpp_http_request`.
- Logged fields are limited to request ID, API surface, HTTP method/status, outcome, duration, auth-presence boolean and stable public error code.
- Severity is deterministic: 2xx/3xx → info, 4xx → warn, 5xx → error.
- The implementation intentionally does **not** log request/response bodies, query parameters, bearer/access/refresh tokens, Supabase keys, cookies, emails/phones, passport identifiers, raw IP addresses or database payloads.
- 401 and 429 responses receive correlation IDs because observability starts before auth and abuse-control gates.

## Remaining before GREEN

A deployed runtime must prove correlated request/response/log events across real serverless invocations, confirm the chosen logging backend/retention/alerts, and demonstrate that production logs do not expose secrets or payloads. Final acceptance also waits for M17–M19 to become GREEN.
