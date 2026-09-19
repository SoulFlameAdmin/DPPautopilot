# R05 Rate Limiting / Abuse Controls — Partial Progress

R05 remains **RED** because its declared dependencies M17–M20 are not all GREEN and a process-local limiter cannot prove distributed production enforcement across parallel serverless isolates or regions.

## Implemented precursor

- `data/rate-limit-policy.json` versions the current budgets:
  - public passport read: 30 requests / 60 seconds;
  - authenticated reads: 120 / 60 seconds;
  - authenticated writes: 40 / 60 seconds;
  - export reads: 20 / 60 seconds;
  - import writes: 20 / 60 seconds.
- `api/_rate_limit.js` provides a fixed-window process-local limiter.
- Client bucket keys use normalized IP plus a truncated SHA-256 digest of the Authorization header. Raw bearer credentials are not stored in buckets or response metadata.
- All current serverless API surfaces call the limiter before auth/database work: models, items, passport, imports and export.
- Denied requests return HTTP 429 with stable `RATE_LIMITED` JSON plus `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`.
- `tests/api/rate-limit.test.cjs` covers budget classification, credential hashing, fixed-window reset, bucket separation, authenticated write exhaustion and anonymous public passport exhaustion.

## Required before GREEN

Production acceptance still needs a shared durable limiter/backend or provider-native distributed rate limiting, deployed runtime evidence across more than one isolate/instance, and abuse/load evidence showing stable 429 behavior under concurrency. No Vercel deployment is attempted by this precursor.
