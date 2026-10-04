# CR02 Production Secure-Tag SKU Decision

Status: **YELLOW — exact production candidate selected; physical sample/provisioning evidence still required**.

## Primary production candidate

**NXP NT4PLDJHN2/2003LXJ**
- family: NTAG X DNA;
- package: HVQFN20 / SOT917 family;
- interfaces: NFC + I2C;
- temperature: -40 °C to +105 °C;
- 16 kB memory;
- ISO/IEC 14443-4 / NFC Forum Type 4;
- CC EAL6+;
- P-256 ECDSA/ECDH, SHA-256/384, AES-128/256;
- nonreversible monotonic counter;
- EdgeLock 2GO certificate-generation/delivery support.

Why primary:
- currently orderable exact manufacturer part;
- distributor stock exists in unit quantities;
- HVQFN is materially easier for controlled PCB/battery-module integration than WLCSP;
- keeps the preferred PKI/ECC architecture and current P-256 verifier direction.

This is a **chip**, not a finished sticker. Production integration needs an antenna/PCB/inlay design and mechanical/tamper plan.

## Lab hardware

**NTAG-X-DNA-EVAL**
- official NXP development kit;
- three eval boards;
- intended for secure-authentication evaluation;
- current NXP public listing shows active/in-stock status.

This is the next required physical purchase/obtainment for CR13/CR24.

## Secondary production candidate

**NXP NT4PLDJUK/20038YZ**
- WLCSP16;
- NFC + I2C;
- same NTAG X DNA security family;
- current distributor stock exists;
- smaller package but higher assembly/integration difficulty.

Use only if mechanical constraints justify WLCSP.

## Rejected as production choice

**NT4PMDJU32 FFC/NFC-only family**
- public distributor listings are inconsistent with NXP lifecycle information;
- NXP's part page marks NT4PMDJU32 as no longer manufactured.

Do not select it for a new production design.

## Pinned manufacturer documentation

- NTAG X DNA product data sheet: current NXP product page lists **Rev 3.2, 6 Jul 2026**.
- NTAG X DNA fact sheet: current NXP product page lists **Rev 2.0, 8 Jul 2026**.
- NTAG X DNA Features and Hints: AN14137.
- NTAG X DNA Quick Start Guide: UG10083.
- EdgeLock 2GO documentation is the provisioning reference family.

## Compatibility and provisioning requirements

Before CR02 can become GREEN:
1. obtain NTAG-X-DNA-EVAL or an explicitly approved equivalent;
2. confirm target-phone NFC interaction on Borko's actual phone and a second representative phone;
3. validate certificate/originality chain and ECC unilateral authentication;
4. document exact EdgeLock 2GO or alternate provisioning route;
5. confirm configuration-lock procedure and recovery/replacement behavior;
6. record antenna/installation constraints for battery use;
7. capture exact sample/lot and evidence in Issue #241.

## Current procurement evidence

Public manufacturer/distributor evidence shows:
- NT4PLDJHN2/2003LXJ is currently sold in unit quantities with stock;
- NT4PLDJUK/20038YZ is currently sold in unit quantities with stock;
- NTAG-X-DNA-EVAL is active and currently stocked by NXP/distributors.

This satisfies **exact-orderable-SKU identification**, but not physical possession or real-device proof.

CR02 remains **YELLOW**.
