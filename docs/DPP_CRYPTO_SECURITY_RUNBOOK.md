# DPP CRYPTO Security Operations Runbook

This runbook covers the software security subsystem on `borko/dpp-security-lab`.
It does not claim physical NFC hardware evidence.

## Trust material

### PKI/ECC mode
- Device private key is generated/stored in the secure NFC/secure element and is non-exportable.
- Backend stores public verification material only.
- Allowed software verifier profile: ECDSA P-256 + SHA-256.
- Public-key replacement creates a new identity version; historical key material/fingerprints remain immutable.

### AES/SUN mode
- Per-device secret is never stored in application DB, source control, logs or API responses.
- Backend DB stores only a protected KMS/HSM lookup reference/fingerprint.
- Verification must call a protected KMS/HSM/vendor adapter.
- Missing protected verifier fails closed as `backend_error`.

## Provisioning gate

An NFC identity begins `pending`.
Activation requires both:
1. proof-of-possession verified;
2. secure configuration/lock verified.

A second active identity for the same Battery ID is rejected.

Provisioning receipt must record station, identity fingerprint, mode, algorithm, lock state, proof-of-possession state and result without secret material.

## Revocation

Revoke immediately on:
- lost/stolen/replaced tag;
- suspected key compromise;
- invalid physical installation;
- confirmed tamper requiring identity retirement;
- manufacturer security incident.

Revocation preserves historical events and cannot reactivate the same identity. A replacement uses a new identity ID, new identity version and new cryptographic key/secret.

## Rotation

Rotation procedure:
1. create new `pending` identity with version > old version;
2. provision fresh secure-element key or protected per-device AES key;
3. verify proof-of-possession and configuration lock;
4. mark old identity replaced/revoked;
5. link new identity through `replaces_identity_id`;
6. activate new identity;
7. test old proof returns revoked and new proof verifies;
8. retain both histories.

Never overwrite old key fingerprints in place.

## Tamper response

Software states: `clear | unknown | tampered | service_open`.
A `tampered` identity fails before cryptographic success is accepted.
Physical tamper effectiveness requires CR24 real-hardware evidence.

## Incident response

If backend/KMS/CA compromise is suspected:
1. fail verification closed if trust cannot be established;
2. disable affected verifier/KMS integration;
3. identify impacted identity versions by fingerprint/reference, not raw key;
4. revoke impacted identities/certificates;
5. rotate CA/KMS material according to provider procedure;
6. provision replacement identities;
7. retain append-only verification/provisioning evidence;
8. record incident timeline and exact affected scope.

Do not mass-mark `authentic` during an outage. Use `backend_error`.

## Logging/privacy

Never log:
- private/symmetric/master keys;
- raw NFC secret material;
- authorization headers;
- raw proof bytes unless a tightly controlled temporary diagnostic process is separately approved;
- owner PII not required for verification.

Persist proof fingerprints and minimal audit metadata only.

## Deployment gates

Software release gate:
- DPP CRYPTO dedicated CI PASS on exact commit;
- migrations reviewed for RLS/revokes and service-only mutation;
- negative tests PASS;
- no secret scan findings in CRYPTO-owned files.

Production authenticity gate:
- exact NFC SKU selected;
- manufacturer datasheet/profile verified;
- real provisioning completed;
- real phone/tag tap captured;
- valid proof PASS;
- copied/replayed/modified proof FAIL;
- revocation FAILS old tag;
- tamper behavior tested where supported;
- evidence linked to CR24.

Until the production authenticity gate is complete, the system must not claim real end-to-end physical authenticity.
