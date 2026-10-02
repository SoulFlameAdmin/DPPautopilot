# DPP CRYPTO Verification Protocol Contract — CR11–CR23

This is the crypto-owned protocol contract for `borko/dpp-security-lab`. It does not change BAT51+ shared core contracts.

## CR11 Dynamic Tap & Verify

A tap must produce dynamic authenticated material. A copied static URL/QR/NDEF route is never sufficient for `authentic`.

Public route uses an opaque alias, not raw sensitive identifiers. Vendor-specific dynamic fields are parsed server-side and verified under the registered NFC identity. Static routing metadata may identify the verification endpoint but cannot itself assert authenticity.

## CR12 Server challenge

Challenge record:
- `challenge_id`: random opaque identifier;
- `challenge_hash`: server-side hash if raw challenge retention is unnecessary;
- `nfc_identity_id` or safe pre-binding context;
- `purpose`: e.g. `strong_verify`;
- `issued_at`, `expires_at`;
- `consumed_at` nullable;
- tenant scope;
- context hash binding expected Battery/public alias where applicable.

Requirements:
- cryptographically random challenge bytes;
- short TTL;
- one-time consumption;
- never reusable after success or terminal verification attempt;
- expired challenges fail closed.

## CR13 NFC proof

PKI/ECC mode: secure element signs/authenticates the fresh challenge plus protocol context using its non-exportable device key.

AES/SUN mode: vendor-supported authenticated dynamic message/challenge response is validated using the protected per-device key boundary.

Proof envelope contains no private/secret key.

## CR14 Verification API

Logical request:
- protocol version;
- challenge ID when challenge mode is used;
- public battery alias/context;
- NFC identity alias/fingerprint reference;
- algorithm/mode identifier;
- proof bytes encoded safely;
- vendor counter/timestamp/tamper evidence when applicable.

Server validation order:
1. parse/version/size validation;
2. resolve tenant-safe identity;
3. require active binding;
4. require supported algorithm;
5. require fresh challenge/dynamic message;
6. verify cryptographic proof;
7. enforce replay/counter rules;
8. enforce revocation;
9. enforce blocking tamper state;
10. resolve exact Battery ID server-side;
11. append verification event;
12. return result contract.

Never trust Battery ID supplied by the client as authoritative.

## CR15 Anti-replay

Fail closed on:
- consumed challenge;
- expired challenge;
- duplicate proof hash where reuse is invalid;
- stale/repeated dynamic message;
- monotonic counter rollback;
- duplicate counter where uniqueness is required;
- context mismatch.

Challenge consumption and verification-event write should be transactionally safe where storage supports it.

## CR16 Result contract

Machine-readable result:
```json
{
  "schema": "dpp.nfc.verification.v1",
  "result": "authentic",
  "reason_code": "proof_valid",
  "verification_id": "opaque-id",
  "battery_public_alias": "opaque-alias",
  "verified_at": "RFC3339"
}
```

Allowed top-level result values:
`authentic | invalid | replay | expired | revoked | unregistered | tampered | backend_error`.

Public responses do not disclose key references, raw proofs, internal tenant IDs, stack traces or existence-sensitive details beyond policy.

## CR17 Verification history

Append-only event fields:
- verification event ID;
- tenant scope;
- Battery ID internal reference;
- NFC identity internal reference;
- timestamp;
- result;
- reason code;
- protocol/mode/algorithm identifiers;
- proof hash, never raw secret;
- challenge ID/hash reference where safe;
- counter metadata where required;
- tamper state;
- minimal request security metadata subject to privacy/retention policy.

No owner PII or unnecessary device fingerprinting.

## CR18 Revocation / replacement

Revocation is irreversible for an identity version. Replacement:
1. revoke old NFC identity with reason/time/actor audit;
2. preserve all old verification/provisioning history;
3. provision a new unique NFC identity;
4. bind new identity to same Battery ID;
5. activate only after proof-of-possession;
6. old identity continues to return `revoked`.

## CR19 Key/certificate rotation

Rotation creates a new key/certificate identity version. Never overwrite historical fingerprints in place. Verification accepts only currently trusted, non-revoked identity versions within validity policy. CA/intermediate rotation supports overlap only under an explicit trust-window policy.

## CR20 Physical anti-swap / tamper

Software cannot prove physical anti-swap alone. Pilot installation must define:
- placement that makes removal materially evident/difficult;
- destructible/tamper-evident label or supported tamper-loop capability;
- recorded installation evidence tied to provisioning receipt;
- tamper state surfaced in verification result;
- replacement procedure after legitimate service.

Physical effectiveness remains hardware-test dependent.

## CR21 BMS binding hook

Crypto layer reserves a nullable, non-authoritative BMS identity reference/evidence slot. NFC authenticity does not automatically authenticate BMS telemetry. Future combined verification must compare independently authenticated NFC and BMS identities against the same Battery ID.

Any shared BMS/core field is owned by Mitko/BAT51+ and requires Issue #241 coordination before implementation.

## CR22 Privacy

- public URLs use opaque aliases/tokens;
- avoid stable raw UID, certificate serial, internal Battery ID or tenant ID in public URLs;
- verification logs minimize IP/user-agent/device data and follow retention policy;
- proof hashes are security evidence, not tracking identifiers exposed publicly;
- public error responses avoid account/tenant enumeration;
- QR access remains independent of NFC authentication.

## CR23 Security test matrix

Minimum automated cases:
1. valid proof → authentic;
2. copied static route without valid dynamic proof → invalid;
3. replayed consumed challenge → replay;
4. expired challenge → expired;
5. modified Battery/public alias context → invalid;
6. wrong certificate/public key → invalid;
7. wrong symmetric per-tag key → invalid;
8. revoked identity → revoked;
9. unknown identity → unregistered;
10. counter rollback/duplicate → replay;
11. tamper asserted → tampered;
12. cross-tenant identity substitution → invalid/unregistered without leakage;
13. unsupported algorithm/version → invalid;
14. malformed/oversized proof → invalid;
15. backend key service unavailable → backend_error, never authentic.

Real-hardware cases remain separate from synthetic unit/API tests and are required by CR24.

## Storage surfaces

Crypto-owned additive storage target:
- `dpp_nfc_identities`
- `dpp_nfc_challenges`
- `dpp_nfc_verification_events`
- `dpp_nfc_provisioning_receipts`

No raw private/symmetric secrets are columns in these tables.

## API surfaces

Target routes:
- `/api/nfc/challenge`
- `/api/nfc/verify`
- `/api/nfc/status`

Provisioning/admin routes, when implemented, require authenticated RBAC and are not public verification endpoints.

## Evidence state

CR11–CR23 are protocol-defined here but remain YELLOW until applicable code/schema/tests exist. CR20 and portions of CR13 remain hardware-dependent. CR24 remains BLOCKED until real NFC hardware exists.
