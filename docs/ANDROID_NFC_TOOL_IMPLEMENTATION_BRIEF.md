# SoulFlame DPP NFC TOOL — implementation brief

Source: Mitko's message `1a10e53b9a0473f6`, “DPP NFC TOOL APK — отделно Android приложение за Secure NFC”. Status: PLANNED / NOT IMPLEMENTED. This is an internal Android tool; no installable APK, Android build or hardware verification is provided by this brief.

## First deliverable: read-only v0.1

1. Use Android native NFC reader mode. Handle missing NFC hardware, disabled NFC, cancelled reads and tag loss explicitly.
2. Show raw UID, Android tag technology list and parsed NDEF records. UID/technology identification is not authenticity proof. Show UNKNOWN for authentication until a supported backend/hardware proof is available.
3. Parse a DPP identifier only from a supported DPP link. Validate HTTPS, expected host and path and explicit identifier; never silently open arbitrary scanned URLs. Invalid/unsupported links must show a reason and disable Open DPP.
4. Resolve the selected identifier through the existing public passport contract after its auth and privacy boundaries are verified. Do not invent a verification endpoint or modify API/schema for this tool. Any authenticated carrier lookup must use the existing tenant-aware contract, not a service-role key in the app.
5. Keep SCAN NFC, VERIFY, PROVISION, OPEN DPP, TEST and LOGS visible. In v0.1, PROVISION is disabled with “not implemented”; VERIFY reports UNKNOWN unless real evidence supports a result. A successful URL read is READ PASS, never SECURE AUTH PASS.
6. Logs record timestamp, operation, result and reason; avoid secrets, authentication tokens, full sensitive NDEF payloads or unnecessarily persistent raw UIDs. No automatic diagnostic sharing.

## Deferred secure operations

- Provisioning requires a defined server contract, authorized login, tenant/product binding, device binding, fresh two-step approval on the phone and server-side audit records.
- Master keys must not be embedded or persisted in the APK. Backend/KMS owns sensitive keys; device-scoped credentials require an explicit storage/lifetime design.
- Offline provisioning is disabled. A backend outage must fail closed for sensitive operations.
- Confirm the actual secure chip SKU/protocol before implementing authentication. The email names NTAG 424 DNA / TagTamper; earlier crypto work references NTAG X DNA. These names must not be treated as interchangeable protocols.
- Secure hardware tests must cover valid proof, replay, wrong key/identity, static copy, expiry, revocation, tamper, cross-battery/cross-tenant substitution and backend/KMS fail-closed. Do not claim GREEN without real hardware evidence.

## Acceptance and dependencies

Required before claiming a working v0.1: buildable Android source, debug APK, target phone/NFC information, real tag read, correct DPP resolution, offline/error behavior and documented physical results. Required before writes: approved backend contract and security review, real secure sample and provisioning permissions. Current repository inventory does not contain an Android app; this brief makes no build claim. Check the separate security workstream for existing work before scaffolding a duplicate.
