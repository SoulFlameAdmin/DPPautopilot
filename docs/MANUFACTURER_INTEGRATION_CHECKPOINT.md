# Manufacturer integration checkpoint — 2026-10-07

This branch combines the existing work for review. It is not a production release.

## Inputs

- Engine: `77b1b79d19b8f99436d20acc94bb6191aea91da5`
- UI #280: `9d2dc1b215ef1e871e1beb6f57f6fdc7f408ece6`
- CSP policy #279: `5b36860d832b4198c8bfc3fc66f3a30a2c4d970e`
- Main baseline: `fa7763f6f0666e5a54ecd634f29cebe8f62aa00c`

All three inputs merged without conflicts in this isolated branch. Main and the two owners' branches are unchanged.

## Fixes in this checkpoint

The shared Supabase helper rejects malformed keys before issuing a request. Existing tenant/member/organization, onboarding-flow and limiter/load test fixtures used `anon-key` or `publishable`, so assertions never reached the mocked RPC. Fixtures now use an explicitly synthetic publishable-shaped key. Runtime validation is unchanged.

The manufacturer onboarding RPC test exercises both canonical DPP environment names and legacy aliases. CI now runs this previously unlisted test suite. The existing QR label source assertion accepts the label after the ACTIVE markup rather than requiring a quote immediately before it.

## Intake security inventory follow-up

R03, R05 and R09 now inventory application, registration-link and manufacturer-onboarding. Seventeen added local tests cover body limits, malformed/invalid input, rate-limit denial and log redaction; CI runs them before C04. Registration-link GET/POST/PATCH explicitly use the 40/minute write budget; its anonymous POST does not imply authentication or proven distributed email-abuse protection.

R07 now inventories all five intake/onboarding tables, including actual source-level access and deletion behavior. The early-access session default expiry is 30 days, not automatic deletion. Retention, erasure/export, external-service access enforcement and deployed database controls remain unverified; policy maturity remains partial. No API runtime behavior or SQL changed in this follow-up.

## Verification

- `node --test tests/api/*.test.cjs`: **329 passed, 0 failed** (mocked/local API tests; no live database evidence).
- R01 environment/secret validator: PASS.
- R02 CSP/header validator: PASS.
- Stage 5 manufacturer validator and Step 20 public passport validator: PASS.
- Of the 60 single-command `python scripts/validate_*` checks extracted from CI: 59 pass; only C04 fails below.
- No migrations applied; no production deployment or physical scan performed.

## Remaining release gates

| Gate | Current evidence / required action |
| --- | --- |
| C04 migration snapshot | Repository migrations missing from the recorded bound snapshot: client application onboarding, early access dashboard details, Gmail dashboard link sessions, specific registration link flow, manufacturer onboarding engine v1. Obtain a current authorized database snapshot and verify actual application before changing evidence. The Supabase `list_migrations` connector returned permission denied during this checkpoint. |

## UI/Engine boundary still open

`live/dashboard.html` loads `client-dashboard.js`, whose current implementation consumes the early-access dashboard-link token and legacy form. The new manufacturer endpoint requires a bearer-authenticated user and active organization. The UI's `configureDppSystem` remains disabled. An early-access token is not a Supabase bearer session and must not be passed as one.

The Engine owner must complete the authenticated session/active-organization handoff and the eight-answer persistence/state binding. Do not enable Configure by removing `disabled` alone. Recheck the Engine branch before implementing overlapping changes.

## Final acceptance after Engine and database readiness

1. Restore a real authenticated user and active organization; confirm cross-tenant denial.
2. Save all eight answers, reload/re-login, and verify persisted answers.
3. Configure only after confirmed saves; render progress from actual responses; test failure/retry.
4. Create product/model/SKU and a batch of ten unique batteries, then ten real passports.
5. Verify public projection without login and restricted-data exclusion.
6. Print and physically scan each QR; confirm the correct passport and serial.
7. Update one record; confirm the same QR/URL and audit history.
8. Run all six workflows on the final integrated commit, then obtain final review.

The supplied Vercel preview requires Vercel login in the available browser. Desktop/mobile visual acceptance remains unverified, separate from passing source checks.
