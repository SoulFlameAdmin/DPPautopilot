#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path

def require(c,m):
    if not c: raise AssertionError(m)

def main():
    require(len(sys.argv)==2,"usage: validate_import_validation_ui.py <dom>")
    dom=Path(sys.argv[1]).read_text(encoding="utf-8",errors="replace")
    for marker in [
        'data-validation-ready="true"',
        'data-row-count="3"',
        'data-valid-row-count="1"',
        'data-error-count="10"',
        'data-download-ready="true"',
        'download="dpp-import-errors.json"'
    ]:
        require(marker in dom,f"M08 missing browser marker: {marker}")
    for code in ['REQUIRED','MODEL_ID_FORMAT','CATEGORY_INVALID','NUMBER_POSITIVE','IDENTIFIER_INVALID','STATUS_INVALID','RANGE_0_100','NUMBER_INVALID','IDENTIFIER_DUPLICATE']:
        require(f'data-error-code="{code}"' in dom,f"M08 missing stable error code: {code}")
    for path in ['model.identification.manufacturer.name','item.unique_identifier','item.state_of_health.percent']:
        require(path in dom,f"M08 error lacks canonical field path: {path}")
    require('invalid rows are blocked' in dom.lower(),"M08 UI does not explicitly block invalid rows")
    require('data:application/json' in dom,"M08 downloadable JSON report not materialized")
    print("M08_IMPORT_VALIDATION_PASS: 3 rows yield 1 valid row and 10 actionable errors with stable codes/canonical paths plus downloadable JSON report")

if __name__=="__main__": main()
