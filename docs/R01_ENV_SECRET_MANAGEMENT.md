# R01 — Environment and Secret Management

## Classification

| Variable / credential | Classification | Allowed location |
|---|---|---|
| Supabase project URL | public configuration | Browser/static config and environment store |
| Supabase publishable key (`sb_publishable_`) | public configuration | Browser/static config and environment store |
| Supabase service-role key | secret | Server-only secret store |
| PostgreSQL/database URL/password | secret | Server-only secret store |
| EU/registry provider client secret | secret | Server-only secret store |
| Webhook/signing/private keys | secret | Server-only secret store |

A publishable Supabase key is intentionally client-safe; it does **not** replace database authorization. DPP tables remain deny-by-default until explicit server/RLS policies are introduced and tested.

## Current binding

- Canonical repository: `SoulFlameAdmin/DPPautopilot`.
- Supabase project: `frhletkiuupgksmgxoxc`, explicitly bound through the DPP namespace migration. DPP-owned public tables/functions use the `dpp_` namespace/prefix and deny client grants by default.
- Vercel delivery is bound through the controlled deployment mirror described in the master plan. F08 remains externally blocked by the Vercel build-rate limit; this does not change secret ownership rules.
- Current static/auth demo contains only the verified Supabase URL and publishable key. No service-role/database/registry/signing secret is permitted in browser assets.

## Environment ownership

Development uses synthetic data and local placeholders. Preview/staging must use separate non-production secret values when a runnable preview becomes available. Production secrets are scoped to production only and must not be copied into preview, GitHub, screenshots, logs, or evidence artifacts.

### Serverless Supabase runtime contract

DPP serverless APIs use `DPP_SUPABASE_URL` and `DPP_SUPABASE_PUBLISHABLE_KEY` as the canonical runtime names. During migration they retain backward-compatible fallback to `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The committed `.env.example` intentionally contains placeholders only. Missing runtime values fail closed with `SERVER_CONFIGURATION_MISSING`; production acceptance must verify the values are actually present in the hosting environment without exposing them.

## Rotation and incident rule

Any server secret suspected of exposure is revoked/rotated before reuse. Public publishable keys may be rotated operationally but are not treated as confidential credentials. A production release must inventory the exact secret names it requires without recording their secret values.

## Verification

CI runs `scripts/validate_env_secret_management.py` plus repository security hygiene. The R01 validator checks client/static files for server-secret identifiers/material, verifies the committed environment template contains placeholders rather than credential values, verifies the explicit public-key classification, and enforces the canonical `DPP_SUPABASE_URL` / `DPP_SUPABASE_PUBLISHABLE_KEY` contract across every current serverless API surface.
