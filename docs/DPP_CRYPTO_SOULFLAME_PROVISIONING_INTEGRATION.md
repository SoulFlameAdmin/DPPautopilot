# SoulFlame Provisioning → Secure NFC Integration Contract

Status: **crypto-side contract only; no shared schema changes in this commit**.

SoulFlame owns the provisioning UI/workflow:
- Create Battery;
- generate BAT-SF-* identifier;
- create active public passport;
- canonical QR/NFC URL;
- QR carrier record;
- physical carrier/UID binding.

CRYPTO starts only after an authorized Battery exists.

## Minimum inputs CRYPTO needs

From the existing SoulFlame provisioning result:
1. `organization_id` / tenant scope;
2. canonical internal `battery_item_id` UUID;
3. public `BAT-SF-*` identifier for display/routing only;
4. canonical public passport URL;
5. physical carrier record identifier, when available;
6. observed NFC UID/family metadata, when available;
7. authorized provisioning actor/station context.

Rules:
- `BAT-SF-*` is not the cryptographic FK;
- raw NFC UID is metadata, never authenticity;
- canonical Battery binding remains `(organization_id, battery_item_id)`.

## Secure-layer output

CRYPTO creates/owns:
- `dpp_nfc_identities`;
- `dpp_nfc_provisioning_receipts`;
- `dpp_nfc_challenges`;
- `dpp_nfc_verification_events`.

Expected flow:
1. receive authorized Battery context;
2. create pending Secure NFC identity;
3. obtain/validate secure-tag public identity/certificate;
4. perform real proof-of-possession;
5. bind identity to canonical Battery UUID;
6. apply/verify configuration lock;
7. append provisioning receipt;
8. activate identity;
9. verification uses challenge + crypto proof, independent of the public passport URL.

## Convenience carrier coexistence

`dpp_physical_carriers` may continue to represent QR/NTAG215/static carriers for provisioning and inventory.

A convenience-carrier PASS must never auto-create an active `dpp_nfc_identities` cryptographic identity.

For NTAG X DNA:
- carrier record = physical hardware/install metadata;
- `dpp_nfc_identities` = cryptographic identity/trust state.

These are related but not interchangeable.

## Shared-field decision boundary

No shared field/schema change is required for the crypto plan **if** SoulFlame can provide:
- organization_id;
- battery_item_id;
- a stable physical carrier record ID or equivalent reference;
- carrier type/family and observed UID as metadata.

The current CRYPTO tables do not have a dedicated `physical_carrier_id` FK. Do not add one until SoulFlame confirms the exact `dpp_physical_carriers` schema and ownership contract.

If Mitko wants explicit DB-level linkage from `dpp_nfc_identities` to `dpp_physical_carriers`, that is a shared-contract decision and must be approved in Issue #241 before migration.

## Security invariants

- no self-assigned admin/secure-provisioner role;
- no raw private/symmetric secrets in browser, URL, DB rows or logs;
- UID alone cannot activate Secure NFC;
- active crypto identity requires proof-of-possession and configuration-lock evidence;
- replacement/revocation preserves history;
- copied QR/static NDEF opens the passport but cannot return `authentic`.
