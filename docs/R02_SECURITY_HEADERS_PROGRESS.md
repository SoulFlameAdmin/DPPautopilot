# R02 Security Headers / TLS — Partial Progress

R02 remains **RED** because its declared dependency F08 is blocked and no live production endpoint exists for TLS/header verification.

## Deploy-time header policy

`vercel.json` now applies these headers to all routes:

- **Content-Security-Policy**
  - same-origin default, base URI, forms and executable assets;
  - plugins/objects disabled;
  - framing disabled;
  - images/fonts may use local `data:` assets and images/workers may use `blob:` where required by the current static UI;
  - network connections are limited to same-origin plus HTTPS/WSS Supabase project hosts;
  - insecure subresource requests are upgraded.
- **Strict-Transport-Security:** `max-age=31536000`.
- **X-Content-Type-Options:** `nosniff`.
- **X-Frame-Options:** `DENY`.
- **Referrer-Policy:** `no-referrer`.
- **Permissions-Policy:** same-origin camera is allowed for future QR scanning; microphone, geolocation, payment and USB are denied.
- `/data/*` continues to use `Cache-Control: no-store, max-age=0`.

## Deliberate CSP compatibility exceptions

The current static demo contains inline scripts/styles, so `script-src` and `style-src` temporarily retain `'unsafe-inline'`. This is explicitly tracked for a later nonce/hash or external-asset refactor. `'unsafe-eval'` and plaintext HTTP sources are not allowed.

Supabase connectivity uses `https://*.supabase.co` and `wss://*.supabase.co` so the same deploy-time policy can work with production and approved preview/staging Supabase projects without broad `https:` or `wss:` source allowances.

## What is not claimed yet

No live TLS or response-header evidence is claimed while F08 remains blocked. R02 cannot become GREEN until a READY production deployment exists, HTTPS is reachable, certificate/hostname validation succeeds, live HTML/`data`/`api` responses match the versioned policy, and the core auth/API/UI journey runs without CSP violations.
