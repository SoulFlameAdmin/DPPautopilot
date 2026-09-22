# R02 Security Headers / TLS — CSP v2 hardening

R02 implementation is proven, but the task is **BLOCKED** on live production acceptance until the explicit Vercel deployment quota backoff expires. F08 is GREEN.

## Implemented hardening

The browser surface no longer depends on CSP `'unsafe-inline'`.

- Every inline `<style>` block from `index.html` and `demo/*.html` is externalized under `/assets/csp/`.
- Every inline `<script>` block is externalized under `/assets/csp/`.
- Dashboard `onclick` handlers are replaced by same-origin event listeners.
- All HTML `style=` attributes and client-side `.style.*` writes are removed.
- Dynamic progress widths use finite external CSS classes instead of inline style mutation.
- CSP now uses `script-src 'self'`, `style-src 'self'`, `script-src-attr 'none'`, and `style-src-attr 'none'`.
- `'unsafe-inline'`, `'unsafe-eval'`, and plaintext `http://` sources are forbidden by the R02 validator.
- Existing HSTS, frame denial, MIME sniffing protection, referrer policy, permissions policy and no-store data policy remain enforced.

## Verification contract

`scripts/validate_security_headers.py` fails if browser HTML reintroduces inline script/style elements, event-handler attributes, style attributes, dynamic client style writes, missing extracted assets, CSP drift, or unsafe tokens.

Before R02 can become GREEN, the exact hardened head must have applicable CI PASS and the production deployment must prove HTTPS reachability, certificate/hostname validation, live HTML/data/API headers matching this policy, and CSP-compatible core UI/auth/API behavior.

## Proven implementation evidence

- Exact hardened head `9c725a64692e25f56b3d9b5841a58c47473c8e38`.
- CI `35681026877`: SUCCESS.
- Cross-browser `35681024203`: SUCCESS.
- U07 visual regression `35681024197`: SUCCESS.
- The CSP validator, DB/API/security contracts and real browser smoke all passed on that head.

## External production blocker

Vercel returned `api-deployments-free-per-day` on PR #174 at `2026-09-22T02:19:01Z` with the explicit instruction `try again in 24 hours`. The next eligible retry is therefore `2026-09-23T02:19:01Z`. `main` automatic deployment is temporarily disabled in `vercel.json` so merging the proven code cannot violate that backoff. No deployment should be attempted before the retry window and global deploy lease are both available.
