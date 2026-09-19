# R09 Logging / Observability — Partial Progress

R09 remains **RED** because F08 is blocked and M17–M20 are not all fully accepted, so production runtime log evidence cannot yet be claimed.

## Repository-level precursor

- Every current serverless API surface starts correlation before rate limiting/authentication: models, items, passport, imports and export.
- A safe incoming `X-Request-ID` is echoed; missing or invalid IDs are replaced with UUID v4.
- Every completed request emits one JSON event named `dpp_http_request`.
- Logged fields are limited to request ID, API surface, HTTP method/status, outcome, duration, auth-presence boolean and stable public error code.
- Severity is deterministic: 2xx/3xx → info, 4xx → warn, 5xx → error.
- The implementation intentionally does **not** log request/response bodies, query parameters, bearer/access/refresh tokens, Supabase keys, cookies, emails/phones, passport identifiers, raw IP addresses or database payloads.
- 401 and 429 responses receive correlation IDs because observability starts before auth and abuse-control gates.

## Remaining before GREEN

A deployed runtime must prove correlated request/response/log events across real serverless invocations, confirm the chosen logging backend/retention/alerts, and demonstrate that production logs do not expose secrets or payloads. Those runtime claims are deferred while F08 remains blocked.
