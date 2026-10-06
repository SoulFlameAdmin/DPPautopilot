# DPP STARTER DOCUMENTS v0.1 — DEMO / SAMPLE / APPROVAL

Source: Mitko's email of 5 October 2026, subject “DPP STARTER DOCUMENTS v0.1 — вкарай ги в DPP като DEMO”.

## Existing integration

The existing `/starter-documents` route maps to `demo/starter-documents.html`; the home menu already links to it. Extend this section rather than adding a duplicate. Styling lives in `assets/csp/starter-documents.css`.

The four existing HTML concepts are illustrative reconstructions, not the original PNG assets. Their data is synthetic. This change removes live API QR requests and live workflow links from the document cards, labels every sheet DEMO / SAMPLE / APPROVAL, and keeps labels visible when printed. No API, live page, database, authentication, routing, deployment configuration or production gate is modified.

## Package inventory

| Expected file | Verified state |
| --- | --- |
| `01_QR_Carrier_Demo.png` | Listed in source README; original bytes not imported or inspected |
| `02_Battery_Passport_Demo.png` | Listed in source README; original bytes not imported or inspected |
| `03_Invoice_with_DPP_QR_Demo.png` | Listed in source README; original bytes not imported or inspected |
| `04_DPP_Autopilot_Dashboard_Demo.png` | Listed in source README; original bytes not imported or inspected |
| `README_DPP_STARTER_DOCUMENTS_v0.1.txt` | Read from the separate email attachment and copied unchanged into `demo/starter-documents/v0.1/` |

The email contains `DPP_STARTER_DOCUMENTS_v0.1.zip` (4,999,434 bytes), but the Gmail attachment reader reports ZIP as unsupported. The archive's actual directory structure, PNG dimensions, labels, QR targets and hashes remain unverified. Do not mark the four originals imported until their bytes have been inspected.

## Remaining steps

1. Obtain the original ZIP or four PNGs through a supported attachment/download route.
2. Inspect archive entries before extraction; verify all four PNGs and their QR destinations, dimensions and DEMO markings. Do not activate or provision any passport while checking them.
3. Import approved demo previews into `demo/starter-documents/v0.1/`, preserving original filenames; wrap each preview with the persistent DEMO / SAMPLE / APPROVAL and no-compliance-evidence notice. Keep the original files separate from production evidence exports.
4. Replace the visibly labelled HTML reconstructions with original previews and record verified hashes in the package inventory.
5. Obtain Mitko's design approval. Approval alone does not establish legal compliance or authorize production promotion.

Create Passport, Public Passport, Compliance & Data Access and CSV / API Import remain planned starter-pack modules after approval; this document does not change the implementation status of existing product features.
