# BASQUEVOLT Technical DPP Pilot — READY FOR CUSTOMER DATA

Status: **READY_FOR_CUSTOMER_DATA**

This handoff defines the bounded technical pilot that SoulFlame can run as soon as BASQUEVOLT (or an appropriate pack/module integrator) supplies approved non-confidential data.

## Scope

The pilot validates the technical data flow only:

1. receive one approved model/SKU dataset;
2. import CSV/XLSX data into the tenant;
3. create individual battery/item records for up to 10 units;
4. publish an individual public record per unit;
5. generate a permanent QR carrier per published record;
6. scan the QR on a phone and resolve the exact record;
7. update an approved field and verify the same permanent QR resolves the updated record;
8. retain version/scan history and tenant isolation.

No statement in this pilot is a legal certification or a guarantee of regulatory compliance.

## Category routing

- **LMT**: uses the existing strict LMT readiness/completeness activation gate.
- **EV / industrial / portable / SLI / other**: may be published only through the explicit Technical Pilot route. The server marks the public payload with:
  - `pilot.mode = technical_pilot`
  - `pilot.regulatory_compliance = false`
  - `pilot.scope = customer_data_validation`
- The Technical Pilot route rejects LMT, so it cannot bypass the LMT regulatory gate.

If BASQUEVOLT supplies cell-only data rather than a battery/pack within the intended DPP product scope, treat it as a technical data demonstrator or request a suitable module/pack/integrator. Do not present a cell-only record as a legally complete battery passport.

## Already proven on production infrastructure

Acceptance dataset:
- SKU/model: `SF-LMT-48V20AH-QR-V1`
- batch: `QR-ACCEPT-20261006`
- 10 unique battery identifiers
- 10/10 ACTIVE passports
- 10/10 active QR carriers
- 10/10 units scanned through QR
- `SF-LMT-QR-000005` has an additional update/version and a second QR scan after the update
- fail-closed QR endpoint resolves only an exact ACTIVE public passport
- production deployment for the QR/SKU client-readiness commit is READY

This evidence proves software behavior with synthetic acceptance data. It is not customer UAT or legal/compliance evidence.

## Data to request from BASQUEVOLT

Minimum for the first import:

- manufacturer/company name;
- one product model or SKU identifier;
- battery category (EV, industrial, LMT, portable, SLI, or other);
- up to 10 unique unit/serial identifiers;
- approved non-confidential model fields;
- approved non-confidential unit fields;
- confirmation of which fields may be public in the pilot;
- contact person for technical UAT.

Preferred delivery: CSV or XLSX.

API access is optional and not required for the first pilot.

Physical samples are not required for the first data-flow validation.

## Intake workflow when data arrives

1. Save the customer file unchanged as source evidence.
2. Import into the isolated customer tenant.
3. Map columns to canonical DPP fields.
4. Run server-side validation; do not commit with row errors.
5. Commit the import and confirm row count equals source count.
6. Confirm unique identifiers and duplicate rejection.
7. Build the approved public payload from customer-authorized fields only.
8. Route by category:
   - LMT -> readiness/completeness gate -> ACTIVE;
   - non-LMT -> Technical Pilot publish -> ACTIVE technical pilot marker.
9. Bind/generate one permanent QR per published unit.
10. Scan all units from a phone and verify exact identifier-to-passport resolution.
11. Update one approved field on one unit and verify the same QR resolves the new value.
12. Capture scan/version evidence and obtain customer UAT.

## External blockers only

The system should not be called customer-complete until these external inputs occur:

- customer-approved source dataset is received;
- product category/scope is confirmed;
- public-field authorization is confirmed;
- customer UAT is performed.

Everything else in the bounded QR/SKU technical-pilot infrastructure is prepared before outreach.
