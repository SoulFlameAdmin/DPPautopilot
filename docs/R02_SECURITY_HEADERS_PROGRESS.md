# R02 Security Headers / TLS — Partial Progress

R02 remains **RED** because F08 is blocked and no live production endpoint exists for TLS/header verification.

## Deploy-time header policy

`vercel.json` now applies these controls globally:

- **Content-Security-Policy** with same-origin defaults, disabled objects/framing, same-origin forms, local scripts/styles, local/data/blob asset allowances where the current static UI requires them, exact HTTPS connectivity to the bound Supabase endpoint, and `upgrade-insecure-requests`.
- **Strict-Transport-Security:** `max-age=31536000`.
- **X-Content-Type-Options:** `nosniff`.
- **X-Frame-Options:** `DENY`.
- **Referrer-Policy:** `no-referrer`.
- **Permissions-Policy:** camera, microphone, geolocation, payment and USB are denied.
- `/data/*` keeps `Cache-Control: no-store, max-age=0`.

The CSP does not allow plaintext HTTP sources or `'unsafe-eval'`. `connect-src` is restricted to same-origin plus the exact bound Supabase endpoint `https://frhletkiuupgksmgxoxc.supabase.co`.

## Deliberate compatibility exception

The current static prototype still contains inline script/style content, so `script-src` and `style-src` temporarily require `'unsafe-inline'`. This is explicitly recorded as a remaining hardening gap; a future nonce/hash or external-asset refactor should remove it before final production hardening.

## Before GREEN

No live TLS/header claim is made by this precursor. R02 requires a real READY production deployment, reachable HTTPS hostname, passing certificate/hostname validation, live HTML/`data`/`api` header verification, and a CSP-compatible auth/API/UI smoke flow before it can become GREEN. F08 is not retried here.
