# CR02 Candidate Decision Record — NTAG X DNA

Status: **candidate selected for procurement validation**, not final production SKU approval.

## Why this candidate matches the current PKI architecture

Official NXP product material describes NTAG X DNA as:
- NFC Forum Type 4 / ISO 14443-4;
- PKI-capable secure authentication IC;
- Common Criteria EAL6+;
- ECDSA/ECDH on NIST P-256;
- on-chip ECC key generation so private keys need not leave the IC;
- SHA-256/384 and AES support;
- nonreversible monotonic counter;
- -40 °C to +105 °C product-family operating range;
- EdgeLock 2GO certificate provisioning support;
- NFC-enabled phone interoperability;
- active NTAG X DNA development kit availability.

This aligns with the CRYPTO branch's preferred `pki_ecc` mode and existing
`ecdsa-p256-sha256` software verifier.

## Procurement target for lab validation

Preferred first lab item: **NTAG-X-DNA-EVAL development kit**.

Reason:
- official NXP development kit;
- three NTAG X DNA eval boards are listed by NXP;
- avoids prematurely locking the product to a wafer/package ordering code;
- enables CR13/CR24 cryptographic and NFC-flow validation before production packaging decisions.

## Important SKU warning

Do not treat family name `NTAG X DNA` as the final production SKU.
At least one NFC-only FFC ordering code, `NT4PMDJU32`, is currently listed by NXP as
"No Longer Manufactured". Production procurement must therefore record the exact
currently orderable part/package and supplier availability before CR02 becomes GREEN.

## Alternative fallback

NTAG 424 DNA / TagTamper remains the AES/SUN fallback:
- AES-128 authentication;
- SUN/SDM dynamic authentication;
- CC EAL4;
- optional tamper loop on TagTamper.

Choosing this fallback changes the production proof path to protected AES/KMS/vendor
verification. It does not justify exporting raw AES keys into the application.

## CR02 exit criteria

CR02 becomes GREEN only after:
1. NTAG-X-DNA-EVAL (or explicitly approved equivalent) is procured/available for lab use;
2. exact production-orderable SKU/package is recorded separately;
3. official datasheet revision is pinned;
4. phone/NFC and environmental fit are confirmed;
5. provisioning route (for example EdgeLock 2GO or approved equivalent) is documented;
6. evidence is linked in Issue #241.

Until then: YELLOW.
