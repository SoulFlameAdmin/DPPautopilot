# CR21 BMS Binding Hook Contract

CR21 adds only the CRYPTO-owned binding contract. It does not modify BAT51+ BMS tables, APIs or ownership.

## Purpose

Secure NFC proves the physical tag/device identity. A future authenticated BMS proof may become a second independent signal bound to the same canonical Battery ID.

The verifier must never treat a plain BMS serial number, user-supplied identifier or unverified telemetry field as proof of battery authenticity.

## Binding record

A CRYPTO-side binding may contain only:
- `organization_id`
- canonical `battery_item_id`
- `nfc_identity_id`
- opaque `bms_subject_reference`
- `bms_proof_profile`
- lifecycle state `pending | active | revoked`
- created/activated/revoked timestamps
- evidence fingerprint/reference, never raw BMS secrets

## Security invariants

1. NFC and BMS proofs are verified independently.
2. Both must resolve server-side to the same `(organization_id, battery_item_id)`.
3. Client-provided Battery ID is never authoritative.
4. Cross-tenant binding is impossible by composite tenant-safe references.
5. A revoked NFC identity cannot be rescued by a valid BMS proof.
6. A failed/tampered NFC result remains failed/tampered.
7. Missing BMS proof is represented explicitly, never silently upgraded to success.
8. Raw BMS private/symmetric keys are not stored in CRYPTO tables.
9. BAT51+ contracts are not changed from this branch.

## Combination contract

The future combined verifier may emit:
- `nfc_authentic_bms_not_present`
- `nfc_authentic_bms_authentic`
- `nfc_authentic_bms_invalid`
- `nfc_invalid`
- `nfc_tampered`
- `backend_error`

This combination is an integration signal only. Public DPP NFC result vocabulary remains the CR16 contract unless Mitko approves a shared API change.

## Integration gate

Before wiring a concrete BMS table/API, Issue #241 must identify:
- canonical BMS subject table/key;
- tenant key;
- cryptographic proof profile;
- lifecycle/revocation semantics;
- which team owns the combined public response.

Until then CR21 can be GREEN only as a tested hook/contract, not as a live BMS integration.
