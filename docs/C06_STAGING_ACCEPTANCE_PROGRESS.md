# C06 Staging Acceptance — Partial Progress

C06 remains **RED** because T10 and C02 are RED and no real READY preview/staging deployment exists.

## Fail-closed staging evidence

A staging candidate is accepted only when one exact commit is proven across:

- a verified READY preview deployment on the canonical Vercel project;
- a full regression run from clean checkout containing T01 through T09;
- production-like configuration using only synthetic or sanitized data;
- **no production customer data and no production database reuse**;
- passing migration/schema verification for the same commit;
- staging smoke evidence with required security headers and representative core routes.

The verifier denies wrong project/environment/state, commit drift, missing mandatory suites, non-production-like config, production data/database reuse, failed security headers and insufficient smoke routes.

## Relationship to C02 / T10

C02 remains the source of live preview identity/route/header evidence. T10 remains the source of final full-regression acceptance. This precursor defines how those outputs must align before staging can be accepted; it does not substitute for either task.

No Vercel create/update/redeploy action is performed here.

## Before GREEN

C06 needs T10 and C02 GREEN plus a real staging acceptance report from the exact READY preview candidate, production-like non-production configuration, migration/schema checks and live smoke tests.
