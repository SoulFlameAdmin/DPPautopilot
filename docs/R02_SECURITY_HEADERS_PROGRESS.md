# R02 Security Headers / TLS — CSP v2 hardening

R02 remains **RED** until the hardened exact commit passes CI and the same policy is verified on a real READY production deployment. F08 is already GREEN, so R02 is dependency-safe.

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
