# E2.4 Real 10-Battery Pilot Evidence Checklist — 2026-10-11

Status: **CHECKLIST ONLY / REAL CUSTOMER EVIDENCE NOT YET PRESENT**

Use this only after an organization explicitly agrees to the managed pilot and an approved data-transfer route exists.

## A. Consent and scope

- [ ] Pilot organization identified and consent recorded.
- [ ] Authorized pilot owner/contact identified.
- [ ] Exactly one agreed first model/SKU recorded.
- [ ] Battery category recorded.
- [ ] About 10 real physical serialized units available.
- [ ] Public/private data boundary agreed before publication.
- [ ] Approved customer data-transfer channel recorded.
- [ ] Customer understands this is technical/compliance-support, not legal certification.

## B. Source evidence

For each material field used in the pilot record:

- [ ] original customer/manufacturer source exists;
- [ ] source document/system/column reference recorded;
- [ ] source value preserved;
- [ ] unit/representation explicitly recorded where applicable;
- [ ] canonical conversion, if any, is deterministic and reviewable;
- [ ] missing, unverified and not-applicable states remain distinct;
- [ ] AI-derived values are not silently promoted to verified facts.

## C. Ten-unit identity manifest

Create a manifest with ten rows:

`unit_no | customer_serial | DPP unique_identifier | model/SKU | passport_id | QR carrier id | initial status | source/evidence ref`

Acceptance:

- [ ] 10/10 real units are physically identifiable.
- [ ] 10/10 customer serials are correct.
- [ ] 10/10 DPP identifiers are unique.
- [ ] No synthetic/demo unit is counted as a real pilot unit.
- [ ] Model identity is consistent across all ten units unless the signed scope explicitly says otherwise.

## D. Physical QR evidence

For each unit:

- [ ] QR physically printed/attached or placed on the agreed physical carrier.
- [ ] Photo shows carrier and unit identity together without exposing unnecessary restricted data.
- [ ] QR decodes to the intended DPP URL.
- [ ] Scan from phone/browser A succeeds without admin login.
- [ ] Scan from a second independent phone/browser B succeeds without admin login.
- [ ] Public projection contains only allowed fields.
- [ ] Restricted/authority-only leakage = 0.
- [ ] UTC timestamp and device/browser note recorded for acceptance scans.

A desktop-generated QR PNG alone is not physical-pilot PASS.

## E. Same-QR update proof

Choose at least two real units, including one primary acceptance unit.

Before update:

- [ ] record passport ID, unique identifier, QR target and selected field value;
- [ ] scan physical QR and capture timestamped public result.

Update:

- [ ] update one customer-approved field through the accepted authenticated workflow;
- [ ] record actor, reason/source, precondition/version and resulting timestamp;
- [ ] no new passport identity or replacement QR is created unless the explicit lifecycle action requires it.

After update:

- [ ] scan the **same physical QR** again from phone/browser A;
- [ ] scan the same QR from phone/browser B;
- [ ] passport identity remains the same;
- [ ] approved updated value is visible where its access class allows;
- [ ] history/version evidence exists;
- [ ] no restricted information appeared publicly.

## F. Failure scenarios

At least these failures must be observed/tested without corrupting the pilot:

- [ ] duplicate battery identifier rejected;
- [ ] wrong/unknown tenant cannot read or mutate private pilot data;
- [ ] viewer/read-only role cannot perform writes;
- [ ] stale update/precondition fails rather than silently overwriting a newer change;
- [ ] malformed/wrong-unit value does not become verified data;
- [ ] missing mandatory data remains visibly missing, not fabricated;
- [ ] revoked/retired/replaced lifecycle state behaves as designed;
- [ ] unavailable network produces a clear failure/retry path rather than a false READY state.

## G. Customer UAT record

Customer performs or witnesses:

- [ ] workspace access;
- [ ] model review;
- [ ] ten-unit manifest review;
- [ ] at least two physical public QR scans;
- [ ] one controlled update and same-QR rescan;
- [ ] completeness/missing-data review;
- [ ] export/evidence-package review where enabled.

For each step record `PASS / FAIL / BLOCKED`, UTC time, operator/witness, exact issue, severity, evidence reference and next action.

## H. E2.4 PASS boundary

E2.4 is **not PASS** merely because the internal BG pilot validator is green or ten synthetic QR codes decode correctly. E2.4 requires real organization consent, real model/units, physical carriers, two-device/browser scans, controlled same-QR update evidence, and customer acceptance.

Until those exist, report the state as `TECHNICAL MECHANISM READY FOR PILOT PREP` or `PILOT BLOCKED`, never `CUSTOMER-PROVEN`.
