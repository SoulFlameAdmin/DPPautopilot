# DPP CRYPTO Identity, Key Custody and Provisioning Contract — CR03–CR10

Branch scope: `borko/dpp-security-lab`. This document defines the crypto-owned contract only and does not modify BAT51+ supplier/factory/lifecycle ownership.

## CR03 — cryptographic identity model

Canonical binding:

`Battery ID ↔ NFC identity ↔ cryptographic key identity`

Each active physical NFC identity belongs to exactly one Battery ID at a time. A Battery ID may have historical revoked/replaced NFC identities, but at most one current active identity unless an explicitly reviewed migration state exists.

Crypto-owned identity record requires:
- internal identity UUID;
- tenant/organization scope;
- Battery ID reference;
- public alias for routing;
- NFC identity fingerprint;
- mode: `pki_ecc` or `aes_sun`;
- algorithm identifier;
- public-key/certificate fingerprint OR protected symmetric key reference;
- lifecycle state: pending / active / revoked / replaced;
- provisioned timestamp;
- activated timestamp;
- revoked timestamp and reason when applicable;
- optional tamper capability/state metadata;
- optional future BMS identity reference hook.

UID alone is metadata, never authenticity proof.

## CR04 — no passport on chip

NFC may contain only the minimum safe material required to route and authenticate:
- safe public route/alias;
- vendor-required dynamic authentication fields;
- non-secret certificate/public identity metadata where appropriate.

NFC MUST NOT contain:
- complete Battery Passport payload;
- owner/customer PII;
- backend credentials;
- symmetric master/diversification keys;
- private keys exported from a secure element;
- privileged API tokens.

The passport remains server-side and independently accessible through QR.

## CR05 — key generation

Every physical NFC identity is cryptographically unique.

PKI/ECC mode:
- generate/provision a unique device keypair using vendor-supported secure-element mechanisms;
- private key remains non-exportable;
- register only public identity/certificate metadata.

AES/SUN mode:
- derive/provision a unique per-tag key from protected root material using a reviewed vendor-supported diversification method;
- never use one reusable hardcoded product key across all tags;
- compromise of one per-tag key must not disclose other tag keys.

Random challenges and server tokens use platform cryptographic RNG only.

## CR06 — private/secret key protection

Private device keys never leave the secure element in asymmetric mode.

Symmetric per-tag secrets:
- never enter browser/frontend code;
- never appear in public URLs;
- never appear in logs or verification history;
- never live in ordinary plaintext application database columns;
- are accessed only through a protected server-side key boundary.

Test fixtures may use clearly non-production synthetic keys isolated to tests and must never be accepted by production configuration.

## CR07 — PKI trust model

Target hierarchy:

`Manufacturer Root CA → DPP NFC Issuing Intermediate → Device certificate/public identity`

Rules:
- root trust anchor changes are explicit, versioned security operations;
- issuing intermediates are replaceable without changing Battery ID;
- device certificate identity is bound to the registered NFC identity;
- certificate fingerprint and issuer identifiers are stored for audit;
- validity windows are checked during verification;
- expired/revoked device identities fail closed;
- certificate renewal creates auditable identity/key history;
- root/issuer private keys are never application-readable.

Pilot may use a dedicated non-production trust hierarchy. Pilot trust anchors must be unmistakably separate from production.

## CR08 — KMS/HSM boundary

Production-sensitive operations belong behind a managed KMS/HSM or equivalent controlled cryptographic boundary:
- CA/intermediate signing operations;
- symmetric master/diversification material;
- provisioning authorization keys where required;
- rotation/revocation authority keys.

Application receives only the minimum operation/result needed. Raw master secrets are not returned to application code.

Forbidden secret locations:
- GitHub;
- Vercel client/public environment variables;
- frontend bundles;
- logs/traces;
- issue comments;
- provisioning receipts;
- analytics;
- normal database rows.

## CR09 — manufacturing provisioning state machine

Dependency-safe crypto flow:
1. Receive an already-authorized Battery ID from the DPP core.
2. Create a pending NFC identity under the same tenant.
3. Provision/generate unique secure-element key identity.
4. Read back only public/fingerprint evidence required by the selected hardware mode.
5. Register cryptographic identity/key reference.
6. Verify a proof-of-possession/authentication operation.
7. Bind the NFC identity to the Battery ID.
8. Apply vendor-supported configuration locks.
9. Emit a machine-readable provisioning receipt.
10. Activate only after all required checks pass.

Failure at any step leaves the identity non-active. Retrying must not silently create multiple active identities.

This workstream does not own factory workflow UI or BAT51+ supplier integration. A shared API/field change requires coordination in Issue #241.

## CR10 — provisioning receipt

Receipt schema, secret-free:

```json
{
  "schema": "dpp.nfc.provisioning-receipt.v1",
  "receipt_id": "uuid",
  "battery_id": "core-owned-id",
  "nfc_identity_id": "uuid",
  "nfc_fingerprint": "sha256-or-vendor-fingerprint",
  "mode": "pki_ecc",
  "algorithm": "vendor-reviewed-algorithm-id",
  "public_key_or_certificate_fingerprint": "optional",
  "protected_key_reference_fingerprint": "optional",
  "station_id": "non-secret-station-id",
  "provisioned_at": "RFC3339",
  "result": "success",
  "configuration_locked": true,
  "proof_of_possession_verified": true
}
```

Receipt MUST NOT contain:
- private key;
- symmetric tag key;
- master/diversification key;
- seed material;
- credential/token;
- raw challenge response when retention is unnecessary.

Receipt is audit evidence, not a secret backup.

## Persistence proposal for later implementation

Crypto-owned tables should be additive:
- `dpp_nfc_identities`
- `dpp_nfc_provisioning_receipts`

Challenge and verification-event tables are defined by CR12/CR17.

Required invariants:
- tenant-scoped foreign references;
- unique active binding for NFC identity;
- one active NFC identity per Battery ID unless reviewed migration state exists;
- append-only receipts;
- no raw secret columns;
- revocation preserves history.

Before adding a foreign key or changing a shared Battery core field, coordinate with Mitko through Issue #241.

## Acceptance state

CR03–CR10 are **contract-defined**, not fully GREEN. GREEN requires applicable schema/API/tests and, for provisioning/key-protection claims, real provider/hardware evidence. This document intentionally separates architecture from evidence.
