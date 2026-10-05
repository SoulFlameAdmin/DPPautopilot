# Vendored SheetJS CE

- Library: SheetJS Community Edition
- Version: **0.20.3**
- License: Apache-2.0
- Authoritative upstream: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- Official upstream MD5: `6b3130af1ceadf07caa0ec08af7addff`

The vendored bytes were cross-checked against two independent GitHub mirrors and the official SheetJS checksum before replacing legacy 0.18.5.

DPP XLSX imports are parsed locally in the browser with formula, HTML and style parsing disabled, a 5 MiB file limit, a 100-column limit and a 1000-data-row limit. The workbook file itself is not uploaded to the DPP backend; only normalized rows are sent to the authenticated import API.
