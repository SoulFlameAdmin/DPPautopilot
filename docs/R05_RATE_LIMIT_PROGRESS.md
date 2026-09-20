# R05 Rate Limiting / Abuse Controls — Partial Progress

R05 remains **RED** because its declared dependencies M17–M20 are not all GREEN and deployed distributed enforcement is not yet accepted. A shared Supabase counter backend now exists for authenticated budgets, but current request enforcement remains process-local until runtime wiring is explicitly enabled and verified.

## Implemented precursor

- `data/rate-limit-policy.json` versions the current budgets:
  - public passport read: 30 requests / 60 seconds;
  - authenticated reads: 120 / 60 seconds;
  - authenticated writes: 40 / 60 seconds;
  - export reads: 20 / 60 seconds;
  - import writes: 20 / 60 seconds.
- `api/_rate_limit.js` provides a fixed-window process-local limiter and a canonical pseudonymous shared-key contract.
- `supabase/migrations/20260920152000_dpp_shared_rate_limit_backend.sql` adds atomic shared authenticated counters in `dpp_rate_limit_buckets` plus `dpp_rate_limit_consume(...)`. The table has RLS, no direct client grants, and the RPC is authenticated-only with fixed `search_path`.
- Shared rows are pseudonymous only: validated network/credential digests, counters and fixed-window timestamps. Raw IPs and bearer credentials are never persisted. Stale rows older than reset+10 minutes are opportunistically pruned.
- Client bucket keys use normalized IP plus a truncated SHA-256 digest of the Authorization header. Raw bearer credentials are not stored in buckets or response metadata.
- All current serverless API surfaces call the limiter before auth/database work: models, items, passport, imports and export.
- Denied requests return HTTP 429 with stable `RATE_LIMITED` JSON plus `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`.
- `tests/api/rate-limit.test.cjs` covers budget classification, credential hashing, fixed-window reset, bucket separation, authenticated write exhaustion and anonymous public passport exhaustion.

## Required before GREEN

Production acceptance still needs runtime wiring of the shared authenticated backend, a safe distributed identity path for anonymous public passport traffic, deployed evidence across more than one isolate/instance, and abuse/load evidence showing stable 429 behavior under concurrency. No Vercel deployment is attempted by this precursor.
