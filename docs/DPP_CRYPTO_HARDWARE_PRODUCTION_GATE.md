# CR02 / CR13 / CR24 Hardware Production Gate

This is the execution sheet for moving Secure NFC from software-ready to physical-authenticity-ready.

## CR02 exact hardware acceptance

Record before procurement:
- manufacturer;
- exact orderable part number / SKU;
- silicon revision if applicable;
- cryptographic mode: PKI/ECC or AES/SUN;
- supported algorithm/profile;
- private-key non-exportability or protected per-device AES key capability;
- dynamic authentication/challenge capability;
- anti-replay counter/transaction mechanism;
- configuration lock capability;
- tamper feature if used;
- memory variant;
- operating temperature and environmental rating appropriate for battery installation;
- vendor lifecycle/availability;
- official datasheet revision/date;
- phone/NFC compatibility evidence.

Reject hardware that only provides a static UID/static NDEF as authenticity proof.

## CR13 provider acceptance

PKI/ECC:
- device key generated/provisioned securely;
- backend receives public key/certificate only;
- P-256/SHA-256 profile confirmed if using current adapter;
- known-valid hardware signature verifies;
- modified challenge/message fails;
- wrong device key fails;
- revoked/replaced identity fails.

AES/SUN:
- unique/diversified per-device key;
- key held behind KMS/HSM/vendor protected verifier;
- application never receives raw master/per-device secret;
- valid dynamic proof verifies;
- modified proof/counter fails;
- stale/rolled-back counter fails;
- revoked identity fails.

## CR24 evidence matrix

Capture evidence ID, timestamp, hardware SKU, firmware/config revision, Battery ID, NFC identity version and PASS/FAIL for:

1. provision new identity;
2. proof-of-possession;
3. configuration lock;
4. normal phone tap;
5. valid strong challenge;
6. copied static URL/QR does not authenticate physical NFC;
7. replay same proof;
8. replay consumed challenge;
9. expired challenge;
10. modified challenge;
11. modified public alias/context;
12. wrong NFC identity/key;
13. revoked old tag;
14. replacement tag;
15. rotation to new identity version;
16. counter rollback where hardware supports counter;
17. tamper open/assertion where hardware supports tamper;
18. cross-battery swap attempt;
19. cross-tenant substitution attempt;
20. backend/KMS unavailable fail-closed;
21. malformed/oversized proof;
22. repeated rapid taps do not bypass one-time challenge;
23. audit event contains no raw proof/key;
24. public response contains no secret/tenant internals.

## Evidence package

Store no secrets. Evidence package should contain:
- redacted photos/video of tag installation and phone tap;
- exact hardware SKU/datasheet reference;
- provisioning receipt ID;
- verification event IDs;
- CI commit SHA;
- sanitized request/response fixtures;
- expected vs actual result table;
- tester/date/device model;
- blocker/exception notes.

CR24 becomes GREEN only after the real hardware matrix passes applicable cases and evidence is linked from the tracker/Issue #241.
