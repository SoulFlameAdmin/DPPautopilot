# C02 Preview Deployment Verification — Partial Progress

C02 remains **RED** because C01 is not GREEN and no preview deployment exists for the canonical Vercel project.

## Read-only Vercel evidence

On 2026-09-19, read-only Vercel discovery identified the canonical project:

- Team: `team_cKaIZfnCMzoiiq80J0MhV0A2`
- Project: `prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr`
- Name: `dpp-autopilot`
- Deployments returned: **0**

No create/update/redeploy action was attempted, so the global Vercel deployment lease was not required.

## Fail-closed preview evidence contract

`data/preview-verification-contract.json` and `scripts/verify_preview_evidence.py` require future evidence to prove all of the following together:

1. canonical Vercel project ID;
2. environment is exactly `preview`;
3. deployment state is `READY`;
4. deployment commit SHA exactly matches the commit under test;
5. required routes return the expected statuses/content;
6. unauthenticated `/api/models` returns `401 AUTH_REQUIRED` and a request ID;
7. required security headers are present;
8. `/data/master-plan.json` preserves `Cache-Control: no-store, max-age=0`.

Synthetic verifier tests prove that wrong project, wrong commit, non-preview/non-READY deployments, missing routes and missing security headers fail closed.

## Before GREEN

C02 requires C01 GREEN plus a real preview deployment and automated live HTTP/TLS/header smoke evidence against that exact deployment. This precursor does not create or retry a deployment.
