# NTAG21x Originality / Authenticity Gate

Status: **INCONCLUSIVE — reject for production use until independently verified**.

Observed physical tag:
- family reported by NFC Tools: NTAG215;
- NDEF URL write/read/tap flow: PASS;
- NFC Tools originality result: `Signature: Invalid`;
- tag remains writable.

## What NXP documents

NTAG213/215/216 devices have a manufacturer-programmed 7-byte UID and a hidden 32-byte ECC originality signature. The signature is created at NXP production time and retrieved with `READ_SIG`. NXP documents the originality signature as ECDSA over secp128r1 and verification against an NXP public key.

Therefore a failed originality check is security-relevant, but **one app's label is not sufficient to identify the root cause**.

## Allowed hypotheses

Until independently tested, keep all four possible:
1. counterfeit / clone / non-NXP silicon;
2. verifier implementation or public-key mismatch in the phone app;
3. different or emulated tag family being interpreted as NTAG215;
4. read/transport/tag damage producing an invalid or incomplete signature result.

Do not collapse these hypotheses into “counterfeit” without independent evidence.

## Verification procedure

Capture all evidence without writing additional data to the tag:

1. Record phone model, OS, app name/version, UID, ATQA, SAK, GET_VERSION result if available, total/user memory and the raw originality-signature bytes if the tool exposes them.
2. Read the same tag with **NXP TagInfo or another NXP-supported originality verifier**.
3. Capture the independent verifier's IC-manufacturer/originality result.
4. Repeat on a second reader/phone if possible.
5. Run the same procedure on a known-good NTAG215 sourced through an authorized NXP channel/partner.
6. If raw `READ_SIG` evidence is available, verify the 32-byte signature against the exact UID using NXP's documented originality-validation procedure.

## Classification rules

- Independent NXP verification PASS -> `ORIGINALITY_PASS`.
- Independent NXP verification FAIL on suspect tag while known-good tag passes on same setup -> `ORIGINALITY_FAIL_REJECT`.
- Verifiers disagree -> `INCONCLUSIVE_REJECT`.
- READ_SIG missing/malformed or tag-family evidence inconsistent -> `FAMILY_OR_TRANSPORT_ANOMALY_REJECT`.
- No independent check -> `INCONCLUSIVE_REJECT`.

Any reject/inconclusive result is **not allowed as production carrier evidence**.

## Security boundary

Even `ORIGINALITY_PASS` on NTAG215 proves only NXP-silicon originality to the extent of the manufacturer signature. It does **not** satisfy CR13/CR24 strong challenge-response, non-exportable application-key identity, replay rejection or production Secure NFC anti-clone requirements.

## Evidence required for closing this investigation

- screenshot/export from the independent NXP verifier;
- exact UID and reported IC family;
- originality result;
- app/reader/phone version;
- known-good comparison result when available;
- tester/date;
- final classification.

Current classification: **INCONCLUSIVE_REJECT**.
