# CR13 Minimal Real Secure-Tag Proof Plan — NTAG X DNA

Status: **YELLOW — protocol/test plan ready; real tag evidence required**.

## Important protocol correction

The existing generic `ecdsa-p256-sha256` provider signs/verifies the DPP canonical newline message.

NTAG X DNA card-unilateral authentication uses a **vendor-defined message**. NXP documents a P-256/SHA-256 unilateral-auth flow where:
- reader provides fresh `RndA`;
- tag generates fresh `RndB`;
- tag returns a 64-byte ECDSA signature `(r || s)`;
- the signed message is based on `0xF0F0 || [OptsA] || RndB || RndA`.

Therefore the real hardware test must use a dedicated NTAG X DNA adapter. Do not pretend the generic verifier is wire-compatible.

## Smallest hardware setup

Required:
- 1 x NTAG-X-DNA-EVAL board;
- NFC reader path capable of ISO/IEC 14443-4 / ISO 7816 APDUs;
- preferred first path: NFC-enabled Android phone if the needed APDU flow is exposed reliably;
- fallback lab path: NXP-supported reader/middleware setup such as NX Middleware/compatible NXP reader;
- DPP backend branch at the exact tested commit.

## Minimum proof sequence

1. Read the tag's pre-provisioned certificate/public identity.
2. Validate the certificate/trust chain using the NXP-documented originality/certificate path.
3. Create a fresh DPP challenge record.
4. Map the hardware reader challenge to the NTAG X DNA `RndA` field without weakening entropy or one-time semantics.
5. Execute ECC unilateral authentication on the tag.
6. Capture `RndB` and the 64-byte signature.
7. Reconstruct the exact vendor-specified signed message.
8. Verify P-256/SHA-256 with the public key from the validated certificate.
9. Atomically consume the DPP challenge and append verification event.
10. Repeat the same proof/challenge and require `replay`.
11. Modify one byte of RndA/context and require `invalid`.
12. Verify using the wrong tag/public key and require `invalid`.
13. Copy only the static DPP URL to NTAG215/QR and show that passport access still works but Secure NFC result is never `authentic`.

## Existing-table mapping

### dpp_nfc_identities
- organization_id: tenant from the already-created Battery;
- battery_item_id: canonical internal Battery UUID;
- public_alias: crypto routing alias, not raw UID;
- mode: `pki_ecc`;
- algorithm_id: dedicated NTAG X DNA unilateral-auth profile;
- public_key_or_certificate_fingerprint: validated device/certificate fingerprint;
- public_key_pem: public key only;
- lifecycle_state: pending until provisioning gates pass.

### dpp_nfc_provisioning_receipts
Record only after:
- identity is bound to Battery;
- certificate/public identity validated;
- proof-of-possession completed;
- configuration-lock status known.

No private key or raw secret is stored.

### dpp_nfc_challenges
- purpose: `strong_verify` or `provisioning_proof`;
- one-time challenge;
- challenge/context hashes only;
- short expiry.

### dpp_nfc_verification_events
- result/reason;
- identity/battery/challenge references;
- algorithm profile;
- proof fingerprint, never raw signature if retention is unnecessary;
- counter/tamper metadata when applicable.

## CR13 PASS criteria

CR13 becomes GREEN only when a real NTAG X DNA device produces a valid cryptographic proof verified by backend code and all of these fail correctly:
- replay;
- modified challenge/context;
- wrong tag/public key;
- static copied URL with no valid cryptographic proof.

Software-generated keypair tests remain unit evidence only and cannot satisfy CR13.

## CR24 handoff

Once CR13 is physically proven, reuse the same adapter and hardware for the larger CR24 matrix: revocation, replacement, rotation, rapid taps, cross-battery, cross-tenant, backend outage, audit secrecy and configuration/tamper cases.
