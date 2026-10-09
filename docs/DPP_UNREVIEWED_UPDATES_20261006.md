# DPP updates reviewed on 6 October 2026

This inventory records newly reviewed correspondence; it does not promote production gates or declare physical tests passed.

| Source message | Material | Findings / action |
| --- | --- | --- |
| `1a10df11f08a21fd` | 30 mm / 600 DPI low-ink PNG | 709 × 709 pixels; approximately 600 DPI; ZXing reads BAT-SF-NFC-0001 passport URL. Added as DEMO preview with print-size rule. Phone/printed scan still pending. |
| `1a10df11f08a21fd` | Low-ink A4 PDF | A4 portrait, one page; QR decodes to same URL. Reviewed, not exposed as an unlabelled downloadable document. |
| `1a10df11f08a21fd` | Full Battery Passport A4 PDF | One A4 landscape page. Automated QR decode failed. Contains COMPLIANT / VERIFIED / production-carrier claims, no clear demo marking, and a regulation label inconsistent with the repository README. Held out of the demo download area pending correction/approval; no compliance claim validated. |
| `1a10d7d41375deaa` | DEMO PRINT PDF | One A4 portrait page; explicit DEMO labels and 50 mm calibration line. QR reads `https://dpp-autopilot.vercel.app/?demo=SF-DEMO-000001`, not a dedicated passport URL. Imported unchanged with checklist; physical test NOT RUN. |
| `1a10def70e627136` | Updated invoice image with centre QR logo | Body and image reviewed: no explicit DEMO banner; contains sample business/VAT/payment details; QR did not decode. Earlier iteration precedes the later approval bundle; not imported as final design. |
| `1a10de8fb96a1881` | Initial invoice image | Body and image reviewed: no explicit DEMO banner; sample business/VAT/payment details; QR did not decode. Earlier draft, not imported. |
| `1a10e53b9a0473f6` | Android NFC TOOL request | No APK attached. Separate internal app, not public DPP app. Implementation brief added separately; no runnable APK or hardware PASS claimed. |
| `1a0fe75b4b8b4c1e` | Crypto next steps | Historical 21/25 GREEN report only; CR02/CR13/CR24 require real secure hardware, CR25 independent deployed reachability. NTAG215 remains URL carrier only. No GREEN statuses modified. |

## Completion evidence still needed

- Exact Starter Documents ZIP-member confirmation from Mitko.
- Printer model, 100% scale result, measured 50 mm line, phone model, actual scan result and photo. Keep failures visible; record timestamp and filename, not an invented PASS.
- A corrected/demo-labelled full passport asset and readable invoice/dashboard QR, or explicit acceptance as non-scannable mockups.
- Starter-specific desktop/mobile and print browser checks; local Chromium installation failed.
- Independent production/crypto work stays separate; no shared-schema merge/cherry-pick or production promotion is part of this demo update.

## GitHub update inventory

Main remains `164ffbc42c3426cdfd747108ff6df8c314869f7c`. Its latest commits already contain stages 36/37 XLSX and saved-mapping work, including folding mappings into the existing imports function for the Vercel Hobby function limit. These are separate existing production changes, not additions in this demo PR; do not build duplicate import/mapping endpoints. The accompanying production acceptance document was read as repository evidence, not independently revalidated by this review.
