# C07 Production Smoke Tests — Partial Progress

C07 remains **RED** because C03, C06 and F08 are not GREEN and no canonical READY production deployment exists.

## Fail-closed smoke evidence

A production smoke report is acceptable only when it proves one exact candidate commit across:

- canonical Vercel team/project, environment=`production`, state=`READY`;
- immutable deployment ID and HTTPS URL;
- successful TLS verification;
- a timezone-aware smoke timestamp at or after deployment readiness;
- passed C03 and C06 evidence for the same commit;
- home route HTTP 200 with DPP marker and required security headers;
- auth UI `/demo/auth.html` HTTP 200 with security headers;
- anonymous `/api/models` HTTP 401 `AUTH_REQUIRED`, `X-Request-ID`, and security headers;
- a real public-passport API request returning HTTP 200, matching identifier, public payload only, and no forbidden private/tenant/auth fields.

The verifier rejects wrong project/environment/state, commit drift, smoke-before-ready timestamps, TLS failure, failed release gates, missing security headers, broken protected API boundary and public-passport privacy leaks.

No Vercel create/update/redeploy action is performed by this precursor.

## Before GREEN

C07 requires C03/C06/F08 GREEN and a real timestamped production smoke report captured after a READY canonical production deployment.
