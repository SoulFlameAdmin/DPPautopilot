# M10 — Public / Private Access Categories Progress

Status: **PARTIAL — master task remains RED**

This dependency-safe precursor uses the already-GREEN M09 field catalog and D06 public passport model.

Implemented:

- versioned access policy in `data/access-class-policy.json`
- exact allowed classes: `public`, `public_identifier`, `legitimate_interest`, `authority_only`
- reusable `scripts/passport_access.py` projection helper
- unit tests proving all 42 catalog fields have one valid class
- public and restricted class sets are disjoint
- public projection includes only `public/public_identifier`
- restricted composition, safety, authority-only report reference and item state-of-health sample values are proven absent from the public projection

This does **not** claim full M10 completion. M10 remains RED because M03 is RED and the production API does not yet enforce role-aware access classes server-side.

## Evidence — access-policy precursor

- `data/access-class-policy.json` versions the four allowed field access classes and explicitly separates public from restricted projections.
- `scripts/passport_access.py` provides reusable public projection logic over the canonical catalog.
- `tests/unit/test_passport_access.py` proves all 42/42 catalog fields carry one allowed class, public/restricted sets are disjoint, and restricted composition, safety, authority-only report reference and state-of-health values do not leak into the public projection.
- `Validate M10 access-class policy` and the T01 unit suite PASS in full GitHub Actions run `35399171822`.
- Full run `35399171822` on `2d04f47fde6c5dcbe9a2a94627c07dca02e1212e` is SUCCESS; UI artifact `10569812847`.
- M10 remains RED because M03 is RED and role-aware server/API enforcement is not yet available.

