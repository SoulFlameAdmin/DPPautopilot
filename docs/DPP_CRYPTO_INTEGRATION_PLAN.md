# DPP CRYPTO — Secure NFC Integration Plan

**Owner for implementation:** Borko
**Integration target:** DPP Battery Autopilot / Battery Platform V3
**Master tasks:** BAT31-BAT40, with forward hooks into BAT41-BAT49
**Rule:** do not invent custom cryptography. Use documented, reviewed primitives and certified secure NFC/secure-element capabilities.

## Target formula

QR = standards-required passport access.
Secure NFC = cryptographic proof that the physical battery being touched is the registered battery.
DPP backend = identity, passport, lifecycle, audit and verification authority.
BMS = later second proof source for telemetry/device binding.

The product should support two NFC verification modes:

1. **Tap & Verify (consumer / no special reader):** a normal NFC phone tap opens a dynamic verification URL carrying a chip-generated authenticated value. Server validates it and shows Authentic / Suspicious / Revoked / Tamper state.
2. **Strong Challenge Mode (service / manufacturer / authority):** verifier obtains a fresh server challenge, the secure NFC element authenticates/signs it, and the server verifies the proof with anti-replay controls.

## Hardware path to evaluate

### Preferred high-assurance path
- Evaluate **NXP NTAG X DNA** or equivalent certified secure NFC element.
- Prefer asymmetric PKI / ECDSA device identity where BOM, availability and integration allow it.
- Private key must be generated/provisioned into the secure element and remain non-exportable.
- Store only public certificate/key metadata in DPP backend.

### Cost/tamper fallback
- Evaluate **NXP NTAG 424 DNA / TagTamper** or equivalent.
- Use Secure Unique NFC / AES-CMAC with a unique diversified key per physical tag.
- Master/diversification secrets must live in KMS/HSM or equivalent protected server-side boundary, never in source code.
- TagTamper can be used where physical opening/seal state adds value.

Final chip selection must be evidence-based: security properties, unit price at scale, availability, phone compatibility, provisioning process, tamper capability and implementation complexity.

---

# CRYPTO EXECUTION — 25 points

| ID | Task | Acceptance |
|---|---|---|
| CR01 | Threat model | Document cloning, copied QR, replay, forged tag, stolen backend key, swapped NFC tag, swapped BMS, tamper, offline attack and privacy risks. |
| CR02 | Hardware decision matrix | Compare at least PKI/ECC secure NFC vs AES/SUN secure NFC and record chosen pilot path + fallback. |
| CR03 | Cryptographic identity model | Define one-to-one binding: Battery ID ↔ NFC identity ↔ public key/certificate or diversified key reference. |
| CR04 | No passport-on-chip rule | NFC must not store the Battery Passport payload; only identity/authentication data and safe routing metadata. |
| CR05 | Key-generation rule | No reusable hardcoded product key. Each physical NFC identity must be unique. |
| CR06 | Private-key protection | For asymmetric mode, private key never leaves secure element. For symmetric mode, per-tag secret is not exposed to client/app/browser. |
| CR07 | Trust root / PKI | Define manufacturer root/intermediate/device certificate chain for asymmetric mode, including certificate identifiers and expiry policy. |
| CR08 | KMS/HSM boundary | Define server-side protection for CA/private provisioning keys or symmetric master/diversification secrets. No production secrets in GitHub/Vercel client env. |
| CR09 | Manufacturing provisioning | Define secure enrolment: create Battery ID → provision NFC → register public identity/key reference → bind to battery item → lock configuration → evidence receipt. |
| CR10 | Provisioning evidence | Create machine-readable provisioning receipt with Battery ID, NFC identity fingerprint, algorithm, timestamp, station and result; never include private secret. |
| CR11 | Dynamic Tap & Verify | Define dynamic authenticated NFC URL/message so copied static NFC data cannot pass as a fresh genuine tap. |
| CR12 | Server challenge API | Define short-lived cryptographically random challenge with challenge ID, expiry, purpose and one-time/replay state. |
| CR13 | NFC proof operation | Secure element signs/authenticates the fresh challenge without disclosing secret material. |
| CR14 | Verification API | Server validates proof, identity binding, algorithm, freshness, counter/nonce, revocation and tamper state. |
| CR15 | Anti-replay | Reused challenge, stale timestamp, duplicate monotonic counter or replayed dynamic NFC message must fail closed. |
| CR16 | Result contract | Return machine-readable: authentic / invalid / replay / expired / revoked / unregistered / tampered / backend_error. |
| CR17 | Verification history | Store append-only verification event with Battery ID, NFC identity, timestamp, result, reason code and proof hash; do not store unnecessary personal/device data. |
| CR18 | Revocation / replacement | Define lost/damaged/compromised NFC revocation and controlled replacement without changing historical Battery ID/audit trail. |
| CR19 | Key/certificate rotation | Define how certificates/keys are renewed or rotated without accepting old revoked identities. |
| CR20 | Physical anti-swap / tamper | Design label/placement/tamper strategy so moving a valid NFC tag to a fake battery is detectable or materially harder. |
| CR21 | BMS binding hook | Reserve contract to bind NFC identity to BMS/device identity so future verification can compare physical NFC proof with BMS identity/telemetry source. |
| CR22 | Privacy | Do not expose stable sensitive identifiers unnecessarily in public URLs; use safe public token/alias and server-side mapping where appropriate. |
| CR23 | Security test matrix | Test valid proof, cloned URL, replay, modified Battery ID, wrong certificate/key, revoked tag, expired challenge, counter rollback, tamper and cross-tenant substitution. |
| CR24 | Integration evidence | Demo on real NFC hardware: tap → crypto verification → exact DPP Battery ID/passport → logged verification event, with test report and no secret leakage. |
| CR25 | Visible progress tracker | Create a live visible DPP CRYPTO progress surface showing CR01-CR25 status, GREEN/YELLOW/RED/BLOCKED counts, current task, last completed task, blocker, branch/PR, latest commit and CI state. It must update whenever task evidence/status changes and be reachable from the DPP dashboard or a dedicated deployed progress page. |

---

# Required DPP integration surfaces

Borko's implementation should target these repository surfaces unless the current code shows a safer equivalent:

- **DB**
  - dpp_nfc_identities
  - dpp_nfc_challenges (if challenge mode needs persisted state)
  - dpp_nfc_verification_events
  - RLS / tenant isolation / append-only audit where applicable
- **API**
  - /api/nfc/challenge
  - /api/nfc/verify
  - /api/nfc/status
  - provisioning/admin endpoints only behind authenticated RBAC
- **UI**
  - public verification result page
  - manufacturer NFC status/provisioning view
  - clear Authentic / Suspicious / Revoked / Tamper result
- **Tests**
  - unit crypto-contract tests
  - API negative/replay tests
  - DB tenant-isolation/history tests
  - real-hardware pilot evidence separately from synthetic tests

## Security laws

1. Never create a home-made cipher, signature scheme or random generator.
2. Never put production private keys, AES master keys, seed material or provisioning secrets in GitHub.
3. Never store a complete passport in NFC.
4. Never trust UID alone as proof of authenticity.
5. Never mark BAT31-BAT40 GREEN from a mock-only test.
6. NFC verification must fail closed if proof is invalid, stale, replayed, revoked or cannot be safely verified.
7. QR remains an independent DPP access path; NFC adds authenticity and must not break QR access.
8. Production key-management design must be reviewable and replaceable without re-architecting the DPP core.

---

# Borko GPT handoff

Start one dedicated GPT chat by pasting the bootstrap below once. After that, the continuation command is exactly:

**Продължи DPP CRYPTO**

## Bootstrap prompt for Borko's GPT

You are implementing DPP CRYPTO for SoulFlameAdmin/DPPautopilot.

Source of truth:
- docs/MASTER_AUTOPILOT_PLAN.md
- docs/DPP_CRYPTO_INTEGRATION_PLAN.md
- data/master-plan.json
- current Battery Platform V3 tasks BAT31-BAT40
- integration hooks BAT41-BAT49

Repository workflow:
- inspect real current GitHub state before changing anything;
- branch from the latest Battery Platform V3 integration state, never work directly in main;
- do not overwrite Mitko's unrelated DPP work;
- use small dependency-safe commits and PR evidence;
- GREEN only after implementation + applicable PASS tests + concrete evidence.

Goal:
Build the complete Secure NFC cryptographic identity layer that binds each physical battery to its DPP Battery ID.

Architecture rules:
- QR is the DPP access carrier; Secure NFC is additional physical-authenticity proof;
- do not store the passport in NFC;
- do not invent cryptography;
- prefer certified secure-element/NFC primitives;
- evaluate PKI/ECDSA secure NFC as preferred high-assurance path and AES/SUN as cost/tamper fallback;
- no production secrets in repo, frontend, logs or test artifacts;
- challenge/replay/revocation/tamper must fail closed;
- every verification must resolve to the exact DPP Battery ID and create safe audit evidence.

Execution:
Work CR01 → CR25 in order, skipping only when a dependency is genuinely blocked. For each point:
1. inspect existing code first;
2. implement the smallest production-compatible slice;
3. add tests;
4. run applicable tests;
5. record evidence;
6. update plan status only if acceptance is truly satisfied;
7. continue to the next dependency-safe point.

Hardware-dependent tasks may remain BLOCKED until a physical NFC dev kit/tag exists. Continue all independent backend/schema/API/test work instead.

When I write **Продължи DPP CRYPTO**, inspect the real repository state, resume from the first incomplete dependency-safe CR point, implement/test it and continue as far as the available tools safely allow. Do not merely explain what to do.

## Mandatory completion handoff

When CR01-CR25 are complete, or when a meaningful integration-ready milestone is complete, Borko must send Mitko a final handoff link before considering the work delivered.

The handoff must include:
- GitHub PR link containing all implementation commits;
- exact branch name and final commit SHA;
- list of completed CR points and any remaining BLOCKED points;
- PASS test / CI evidence links;
- exact files and migrations added or changed;
- integration instructions for merging into the main DPP Battery Platform;
- hardware/provisioning notes needed for real NFC testing;
- no secrets, private keys, seed material or credentials in the handoff.

The work is not considered handed off until Mitko has a concrete GitHub link and can integrate it into the DPP system.

## Visible progress contract

CR25 is mandatory. Mitko must be able to open one page and immediately see where DPP CRYPTO is.

Minimum machine-readable status: `data/dpp-crypto-status.json`.
Minimum visible surface: either a dedicated `demo/dpp-crypto-progress.html` page or an integrated DPP dashboard card/page.

The visible tracker must show:
- total CR points: 25;
- GREEN / YELLOW / RED / BLOCKED counts;
- percentage based only on evidence-backed GREEN points;
- current CR point;
- last completed CR point;
- next dependency-safe point;
- active blocker and whether it is hardware/human/external;
- working branch;
- PR number/link;
- latest commit SHA;
- latest CI/test state;
- last update timestamp;
- direct links to evidence when available.

Every time Borko's GPT changes a CR status or finishes a meaningful implementation slice, it must update the machine-readable status and visible tracker in the same branch/PR. The tracker must never mark a point GREEN merely because code was written.

## Cross-session coordination

Before every `ПРОДЪЛЖИ DPP CRYPTO`, read `docs/DPP_SESSION_BRIDGE.md` and the latest comments in GitHub issue #241. Post status/handoff back to issue #241 after every meaningful implementation slice.
