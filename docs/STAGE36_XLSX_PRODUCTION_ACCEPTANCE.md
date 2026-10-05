# Stage 36 · XLSX / Excel Import · Production Acceptance

Accepted on 2026-10-05.

## Production implementation
- Manufacturer Operations now accepts both CSV and Excel `.xlsx` sources.
- XLSX parsing happens locally in the browser; the workbook itself is not uploaded to DPP Autopilot.
- SheetJS Community Edition 0.20.3 is pinned and self-hosted at `/vendor/xlsx.full.min.js`; its Apache-2.0 license and vendoring provenance are stored alongside it.
- The operator can select a worksheet from multi-sheet workbooks.
- Selected worksheet rows enter the same canonical mapping, local validation, staging, server validation, atomic commit and replay-idempotency pipeline used by accepted CSV imports.

## Input safety gates
- XLSX only; macro-enabled `.xlsm` and legacy `.xls` are not accepted by this stage.
- XLSX file size limit: 5 MiB.
- Workbook sheet list is capped at 50 visible worksheet choices.
- Per selected worksheet: maximum 1000 data rows and 100 columns.
- Empty headers and duplicate headers fail closed.
- Formulas are not evaluated by the application; parser formula extraction is disabled and imported values use worksheet cell values/text.
- Import permissions remain owner/admin/editor through the existing authenticated import API.

## Acceptance evidence
- Vendored SheetJS 0.20.3 bytes were cross-checked against two independent mirrors and the official upstream MD5 `6b3130af1ceadf07caa0ec08af7addff`.
- The vendored 0.20.3 parser passed syntax validation and real two-sheet XLSX parsing acceptance.
- A synthetic two-sheet workbook was generated, serialized to XLSX, read back with the vendored parser, and returned the exact expected two battery rows.
- Manufacturer Operations script passed JavaScript syntax validation after XLSX integration.
- Vercel production deployment containing the XLSX import implementation reached READY.
- Regression test `tests/unit/xlsx-import.test.cjs` covers parser round-trip plus production-page self-hosting and XLSX controls.

## Result
Stage 36 is accepted as GREEN. XLSX data feeds the existing production DPP import transaction rather than a separate demo or browser-only storage path.
