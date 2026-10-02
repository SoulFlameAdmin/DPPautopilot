# DPP Secure NFC Hardware Decision Matrix — CR02

Status: decision artifact for `borko/dpp-security-lab`  
Depends on: CR01 threat model  
Scope boundary: Secure NFC crypto only. No BAT51+ shared contracts are changed here.

## Decision

Use a **PKI/ECC secure NFC device with a non-exportable per-device private key** as the preferred production direction.

Use an **AES/SUN secure NFC device with a unique/diversified per-device secret** as the pilot fallback when PKI/ECC hardware, tooling, lead time or integration support prevents a timely pilot.

Named candidate families in the current DPP CRYPTO plan:
- Preferred candidate: NXP NTAG X DNA or equivalent PKI/ECC secure NFC.
- Fallback candidate: NXP NTAG 424 DNA / TagTamper or equivalent AES/SUN secure NFC.

Exact ordering code, silicon revision, memory variant, certification status, mobile compatibility and vendor lifecycle MUST be verified against the current manufacturer datasheet before procurement. This repository decision does not substitute for that procurement check.

## Decision matrix

| Criterion | PKI/ECC secure NFC | AES/SUN secure NFC | DPP decision |
|---|---|---|---|
| Device identity | Public key/certificate can represent device identity | Backend key reference / diversified secret identifies device | Prefer PKI/ECC |
| Secret exposure | Private key should remain non-exportable on device | Symmetric secret exists on tag and verifier-side secure key boundary | PKI/ECC reduces symmetric-secret blast radius |
| Backend verification | Public-key verification; trust anchors/cert chain | MAC/SUN verification through protected key service | Both viable |
| Key distribution | Public keys/certs can be distributed without secrecy | Secret derivation/master-key custody requires stricter backend controls | Prefer PKI/ECC |
| Clone resistance | Strong when proof requires device-held private key | Strong when per-device secret and dynamic proof are correctly provisioned | Both can satisfy CR01 |
| Replay resistance | Requires challenge/freshness protocol | Requires freshness/counter/SUN validation and replay state | Protocol control required in both |
| Revocation | Certificate/device identity revocation model | Key/device identity revocation model | Both required |
| Rotation/replacement | New keypair/cert or device identity | New diversified secret/device identity | Both required |
| Provisioning complexity | PKI issuance, cert/key binding and trust-chain evidence | Secure diversified-key provisioning and KMS/HSM custody | Pilot may favor AES/SUN if simpler |
| Backend key compromise | Verification can use public material; issuer/signing keys still protected | Master/derivation keys are highly sensitive | PKI/ECC preferred |
| Offline verification potential | Better architectural fit if trust chain and freshness policy are explicitly designed | Possible only with carefully bounded symmetric verifier trust | No offline authenticity claim in initial pilot |
| Privacy | Must avoid unnecessary stable public identifiers | Must avoid unnecessary stable public identifiers | Equal requirement |
| Hardware tamper evidence | Depends on selected product/package/install | TagTamper-capable variants may provide physical tamper signal | Validate exact SKU |
| Pilot speed | Potentially slower if tooling/provisioning stack is immature | Mature dynamic-auth/SUN path may be quicker | AES/SUN allowed fallback |
| Long-term architecture | Strong fit for independently verifiable device identity | Viable, but increases symmetric key-management burden | PKI/ECC target |

## Required architecture by option

### Option A — PKI/ECC target

Per battery:
1. Secure NFC device generates or contains a unique non-exportable private key.
2. Backend stores only the corresponding public identity/certificate metadata needed for verification.
3. Provisioning binds Battery ID ↔ NFC identity ↔ public key/certificate reference.
4. Verification uses a fresh server challenge and validates a device proof under the registered public identity.
5. Revocation and replacement preserve historical identity records.

Production issuer/root/intermediate private keys are outside application storage and outside git. If signing keys are required, they belong behind a managed KMS/HSM or equivalent controlled signing boundary.

### Option B — AES/SUN pilot fallback

Per battery:
1. Each NFC device receives/derives a unique secret. No global hardcoded product key.
2. Backend stores only a protected key reference or performs verification through a KMS/HSM-backed service.
3. Provisioning binds Battery ID ↔ NFC identity ↔ protected key reference.
4. Dynamic authentication data must be freshness/replay checked.
5. Compromise of one battery key must not reveal other battery keys.
6. Revocation/replacement must invalidate the old device identity without deleting audit history.

A master/diversification key must never be exposed to browser/mobile clients, logs, source control or ordinary database rows.

## Pilot selection gate

Choose **PKI/ECC** for the pilot when all of these are demonstrated:
- exact SKU is procurable in the required quantity;
- normal target phones can perform the required tap flow;
- vendor-supported cryptographic verification flow is understood;
- provisioning can produce per-device identity evidence;
- backend can verify without exporting private device keys;
- negative/replay tests can be automated.

Choose **AES/SUN fallback** only when PKI/ECC misses the pilot schedule and all of these are demonstrated:
- exact SKU supports the required dynamic authentication mode;
- per-device key diversification is available;
- backend master/derivation key custody is isolated behind KMS/HSM or equivalent;
- replay/freshness semantics are documented and testable;
- no shared static product key is used.

If neither option meets its gate, CR02 hardware status is BLOCKED rather than silently downgraded.

## Procurement evidence checklist

Before purchasing pilot tags, capture:
- manufacturer and exact ordering code;
- datasheet revision/date;
- cryptographic capabilities used by our design;
- NFC Forum / phone compatibility evidence relevant to target devices;
- secure key-generation/provisioning method;
- tamper feature, if claimed;
- sample quantity and lead time;
- vendor lifecycle/availability statement where available;
- tooling/SDK requirements;
- evidence that secrets can remain outside app source/database.

No vendor marketing statement alone makes the hardware GREEN.

## CR01 threat mapping

- TM-01 clone → per-device cryptographic proof.
- TM-03 replay → challenge/freshness and replay state, independent of hardware choice.
- TM-04 forged tag → registered key/certificate verification.
- TM-05 backend key theft → PKI public verification preferred; AES keys isolated in KMS/HSM.
- TM-06 NFC swap → one-to-one Battery ID binding plus tamper controls.
- TM-08 physical tamper → exact SKU/install validation required.
- TM-09 offline downgrade → initial pilot remains online-authoritative.
- TM-10 privacy → minimize stable public identifiers in both options.
- TM-12 provisioning compromise → authenticated provisioning and evidence required.

## CR02 state

**READY as an architecture decision artifact.**

Hardware procurement and real-device proof remain **BLOCKED/PENDING** until exact SKU and manufacturer evidence are captured. CR02 does not claim that physical tags have been purchased, provisioned or tested.
