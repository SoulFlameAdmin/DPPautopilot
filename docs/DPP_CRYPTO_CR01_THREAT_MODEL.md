# DPP Secure NFC Threat Model — CR01

Status: implementation artifact for `borko/dpp-security-lab`  
Scope: Secure NFC cryptographic verification for DPP Battery Autopilot  
Owner boundary: Borko CRYPTO workstream. This document does not change BAT51+ supplier/factory/lifecycle contracts.

## Security objective

A public QR code provides DPP passport access. Secure NFC provides cryptographic proof that the physical battery presented to the verifier is the registered battery. The backend binds that proof to the DPP identity, lifecycle audit trail and verification result.

The system MUST fail closed for invalid, expired, replayed, revoked, unregistered or tamper-indicated proofs. No private key, symmetric tag key or production credential may be stored in this repository.

## Protected assets

- Battery identity and its one-to-one NFC binding.
- NFC device private key or diversified secret.
- Backend trust anchors and key references.
- Server challenges, nonces and replay state.
- Verification events and audit history.
- DPP passport integrity and provenance.
- Future BMS binding evidence.

## Trust boundaries

1. Public phone/browser ↔ DPP verification API.
2. Phone/NFC reader ↔ secure NFC tag or secure element.
3. Verification API ↔ challenge/replay store.
4. Verification API ↔ KMS/HSM or public-key trust store.
5. Provisioning station ↔ secure NFC tag.
6. DPP backend ↔ battery/NFC identity registry.
7. Future BMS proof ↔ DPP backend.

Anything arriving across these boundaries is untrusted until authenticated and validated.

## Threat register

| ID | Threat | Security impact | Required control | Evidence target |
|---|---|---|---|---|
| TM-01 | NFC clone / copied UID | Counterfeit battery appears genuine | Never trust UID alone; require per-device cryptographic proof and registered binding | Negative test with copied UID and wrong key |
| TM-02 | Copied static QR | Attacker copies passport link to another battery | Treat QR as access only, never authenticity proof; authenticity state must come from NFC verification | UI/API test showing QR-only state is not authenticated |
| TM-03 | Replay of valid NFC proof | Captured proof reused later | Fresh server challenge, short expiry, one-time consumption, replay record | Repeat identical proof and require `replay` |
| TM-04 | Forged/emulated NFC tag | Software or commodity tag impersonates secure element | Verify signature/MAC using registered device key/certificate; reject unknown identity | Forged proof negative test |
| TM-05 | Backend key theft | Attacker can validate or mint fraudulent trust material | Keep production secrets outside repo; use KMS/HSM boundary, least privilege, rotation and audit | Config/security review; no secret material in git |
| TM-06 | NFC tag swapped between batteries | Genuine tag attached to counterfeit/different battery | One-to-one Battery ID ↔ NFC identity binding plus tamper evidence; future BMS binding adds second proof | Binding mismatch/tamper test |
| TM-07 | BMS swapped or spoofed | Electronics identity no longer matches physical battery | Reserve explicit BMS binding hook; require independent BMS proof before treating it as corroboration | Future BMS mismatch test; not GREEN until hardware evidence exists |
| TM-08 | Physical tamper / seal bypass | Genuine secure tag removed or enclosure altered | Tamper-evident installation, tamper state in verification result, append-only event history | Real-hardware tamper evidence required |
| TM-09 | Offline/downgrade attack | Verifier cannot check freshness/revocation and accepts stale proof | Online verification is authoritative; offline mode must not claim current authenticity unless a separately specified offline trust policy is met | Network-loss test must fail safe |
| TM-10 | Privacy tracking via stable NFC identifiers | Third parties correlate taps to a battery/user | Minimize public identifiers, avoid exposing secrets/owner PII, log only required security metadata, define retention | Privacy review and log-field test |
| TM-11 | Cross-tenant identity substitution | Valid proof from one tenant/battery is applied to another | Tenant-scoped lookup plus exact battery/NFC binding before verification success | Cross-tenant negative test |
| TM-12 | Provisioning compromise | Malicious/incorrect key is registered at manufacture time | Authenticated provisioning, evidence record, unique device identity, dual-control/approval where practical | Provisioning evidence + unauthorized provisioning test |

## Verification invariants

A successful verification requires all applicable invariants:

1. The NFC identity is registered and active.
2. The NFC identity is bound to exactly the requested battery identity.
3. The cryptographic proof validates under the registered trust material.
4. The server challenge is fresh, unexpired and unused.
5. The proof is bound to that challenge and expected context.
6. Revocation state is clear.
7. No blocking tamper state is present.
8. Verification produces an auditable event without exposing secret material.

## Fail-closed result vocabulary

The verification layer should converge on these explicit outcomes:

- `authentic`
- `invalid`
- `replay`
- `expired`
- `revoked`
- `unregistered`
- `tampered`
- `backend_error`

`backend_error` is never equivalent to `authentic`.

## Cryptographic design constraints

- Do not invent custom cryptographic algorithms or protocols.
- Prefer a secure NFC/secure element with non-exportable per-device key material.
- Preferred hardware direction: PKI/ECC-capable secure NFC such as NXP NTAG X DNA or equivalent.
- Fallback direction: AES/SUN-capable secure NFC such as NXP NTAG 424 DNA/TagTamper or equivalent, with unique/diversified keys and backend KMS/HSM protection.
- Never use one hardcoded shared product key across all batteries.
- Never store the DPP passport itself in NFC.
- Never commit private keys, production symmetric keys, credentials or recovery secrets.

## CR01 acceptance mapping

CR01 explicitly covers:
- clone attack → TM-01
- copied QR → TM-02
- replay → TM-03
- forged tag → TM-04
- stolen backend key → TM-05
- swapped NFC → TM-06
- swapped BMS → TM-07
- tamper → TM-08
- offline attack → TM-09
- privacy → TM-10

Additional isolation/provisioning threats are captured by TM-11 and TM-12.

## Dependency handoff

CR01 defines the threats and invariants only. Controls become evidence-backed through later CR points for hardware selection, identity binding, key custody, challenge/verify APIs, anti-replay, revocation, tamper handling, BMS binding and attack tests.

CR01 can be considered READY as a threat-model artifact once this file is committed and CI remains PASS. It does **not** make the NFC system GREEN by itself.
