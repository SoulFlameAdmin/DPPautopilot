# E2.3 import review status

Exact base: `0ecc7e4bb76aad55f97ef3536d003e0ac2a172ec`

## PASS candidates in this Draft

- HTTP import boundary rejects malformed commit-authoritative identities.
- Supplied LMT canonical values are checked against locked matrix scalar types/domains/order before the Vercel route stages them.
- Saved mapping targets are constrained to known catalog / 71-point paths at the HTTP boundary.
- Negative tests exercise forged empty caller error arrays with bad LMT values.

These are defense-in-depth properties only.

## BLOCKED

- The authenticated Supabase RPC remains directly callable and therefore can bypass the Vercel validator.
- Database `dpp_validate_import` still derives status from stored caller-originated `validation_errors` instead of deriving canonical semantic errors itself.
- Source units and deterministic conversion evidence are not represented by the current mapping contract.
- Complex nested field schemas remain incomplete.
- The manufacturer import UI still contains the legacy `item.state_of_health.percent` target and has no source-unit selection/review step.

## Release boundary

No production SQL, migration execution, snapshot refresh, merge, deploy, secret/ACL change or live data mutation is part of this Draft. C04 remains RED. Any new database migration changes the exact locked 10-migration rehearsal set and therefore needs explicit owner scope approval first.
