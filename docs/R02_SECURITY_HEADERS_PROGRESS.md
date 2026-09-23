# R02 Security Headers / TLS — production acceptance

R02 is **GREEN**. The strict CSP implementation is deployed to canonical production and the live production hostname has been verified against the committed security-header policy.

## Implemented hardening

- Browser surfaces contain no inline `<script>` or `<style>` blocks.
- Inline event handlers, `style=` attributes and dynamic inline style writes are removed.
- CSP uses `script-src 'self'`, `style-src 'self'`, `script-src-attr 'none'` and `style-src-attr 'none'`.
- `'unsafe-inline'`, `'unsafe-eval'` and plaintext `http://` sources are forbidden.
- HSTS, `nosniff`, frame denial, no-referrer and restrictive Permissions-Policy are enforced.
- `/data/*` remains `Cache-Control: no-store, max-age=0`.

## Verified acceptance — 2026-09-23

- Exact release PR head: `24ce73989793848ea39efbba656ff88be78b96c2`.
- GitHub Actions CI `35879001610`: **SUCCESS**.
- READY preview: `dpl_AMr7nnBk1KUu3zHeqbo7UeEQkzG9`.
- Production commit: `1cb4cea91006baf2aadc195976bd030d465e81b1`.
- READY production deployment: `dpl_EHNFvRsgXuFXCmuJ46mRwbaBqRFg`.
- Canonical hostname: `https://dpp-autopilot.vercel.app`.
- Live `/`: HTTP 200 with the strict CSP and all required global headers.
- Live `/data/master-plan.json`: HTTP 200, JSON, strict headers and `Cache-Control: no-store, max-age=0`.
- Live `/api/models` without bearer: HTTP 401 `AUTH_REQUIRED`, request correlation ID present, strict headers intact.
- HTTPS fetch on the canonical production hostname completed successfully through the TLS-validating Vercel connector; certificate/hostname validation produced no TLS error.
- Live CSP contains neither `'unsafe-inline'` nor `'unsafe-eval'`.

The concrete runtime tuple is stored in `data/security-headers-policy.json`. `scripts/validate_security_headers.py` now requires that production evidence whenever R02 is marked GREEN.
