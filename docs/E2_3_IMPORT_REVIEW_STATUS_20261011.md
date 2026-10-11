# E2.3 import review status

Exact base: `0ecc7e4bb76aad55f97ef3536d003e0ac2a172ec`

## PASS candidates in this Draft

- HTTP import boundary rejects malformed commit-authoritative identities.
- Supplied LMT scalar canonical values are checked against locked matrix types/domains/order before the Vercel route stages them.
- Unknown LMT canonical paths fail closed; complex array/object paths stay quarantined until field-specific schemas exist.
- Duplicate battery identifiers in one import batch fail before staging.
- Conflicting rows for the same model identifier fail before the database can apply row-order-dependent last-write-wins updates.
- New saved mapping targets are constrained to known catalog / locked 71-point paths at the HTTP boundary.
- Harmless retired legacy mapping targets remain readable, but stored prototype-chain targets fail closed at the HTTP response-shape boundary.
- Negative tests exercise forged empty caller error arrays with bad LMT values.

These are defense-in-depth properties only.

## BLOCKED

- The authenticated Supabase import RPC remains directly callable and therefore can bypass the Vercel validator.
- Database `dpp_validate_import` still derives status from stored caller-originated `validation_errors` instead of deriving canonical semantic errors itself.
- The authenticated saved-mapping RPC still accepts arbitrary string target paths; authoritative canonical-path validation is not yet in PostgreSQL.
- `dpp_commit_import` replaces the entire existing model `canonical_data` on model-ID conflict and has no expected-version/CAS guard; partial imports can therefore clobber richer existing model state and concurrent imports can lose updates.
- Source units and deterministic conversion evidence are not represented by the current mapping contract.
- Complex nested field schemas remain incomplete, so such values are intentionally quarantined by this Draft rather than accepted loosely.
- The manufacturer import UI still contains the legacy `item.state_of_health.percent` target and has no source-unit selection/review step.

## Release boundary

No production SQL, migration execution, snapshot refresh, merge, deploy, secret/ACL change or live data mutation is part of this Draft. C04 remains RED. Any new database migration changes the exact locked 10-migration rehearsal set and therefore needs explicit owner scope approval first.
