#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    require(len(sys.argv)==2,"usage: validate_xlsx_import_demo.py <dom>")
    dom=Path(sys.argv[1]).read_text(encoding="utf-8",errors="replace")
    markers=[
        'data-import-loaded="true"',
        'data-xlsx-preview-ready="true"',
        'data-source-format="xlsx"',
        'data-sheet-count="2"',
        '<option value="0">Batteries</option>',
        '<option value="1">Suppliers</option>',
        '<th>manufacturer_name</th>',
        '<th>rated_capacity_ah</th>',
        'Northstar XLSX Cells',
        'urn:dpp:xlsx:000001',
    ]
    for marker in markers:
        require(marker in dom,f"BAT16 XLSX browser evidence missing: {marker}")
    require('id="columnCount">5<' in dom,"BAT16 expected 5 preview columns")
    require('id="rowCount">2<' in dom,"BAT16 expected 2 preview rows")
    print("BAT16_XLSX_UI_PASS: workbook sheets, headers and preview rows render before mapping")

if __name__=="__main__":
    main()
