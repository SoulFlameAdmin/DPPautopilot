# R02 Security Headers / TLS — Partial Progress

R02 remains **RED** because its declared dependency F08 is blocked and no live production endpoint exists for TLS/header verification.

## Deploy-time header policy

`vercel.json` now applies these headers to all routes:

- **Content-Security-Policy**
  - default source: same origin only;
  - scripts: same origin plus temporary `'unsafe-inline'`;
  - styles: same origin plus temporary `'unsafe-inline'`;
  - images/fonts: same origin plus `data:`;
  - network connections: same origin plus the bound Supabase Auth endpoint only;
  - objects disabled;
  - base URI and form actions same-origin only;
  - framing disabled;
  - insecure subresource requests upgraded.
- **Strict-Transport-Security:** `max-age=31536000`.
- **X-Content-Type-Options:** `nosniff`.
- **X-Frame-Options:** `DENY`.
- **Referrer-Policy:** `no-referrer`.
- **Permissions-Policy:** camera, microphone and geolocation disabled.
- `/data/*` continues to use `Cache-Control: no-store, max-age=0`.

## Deliberate CSP limitation

The current static prototype contains inline scripts and styles, so removing `'unsafe-inline'` now would break the tested application. This precursor therefore records that exception explicitly instead of pretending to have a nonce/hash CSP. Before final production hardening, inline executable/style content should be migrated to external assets or protected with nonces/hashes.

`unsafe-eval`, wildcard sources and plaintext HTTP sources are not permitted.

## What is not claimed yet

No live TLS or response-header evidence is claimed while F08 remains blocked. R02 cannot become GREEN until a READY production deployment exists, HTTPS is reachable, certificate/hostname validation succeeds and a live response-header scan matches the versioned policy.
