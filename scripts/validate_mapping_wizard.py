#!/usr/bin/env python3
from __future__ import annotations
import json,re,sys
from pathlib import Path

def require(c,m):
    if not c: raise AssertionError(m)

def main():
    require(len(sys.argv)==2,"usage: validate_mapping_wizard.py <dom>")
    dom=Path(sys.argv[1]).read_text(encoding="utf-8",errors="replace")
    for marker in ['data-mapping-ready="true"','data-header-count="8"','data-mapped-count="8"','data-payload-valid="true"']:
        require(marker in dom,f"M07 missing browser marker: {marker}")
    for path in [
        "model.identification.manufacturer.name","model.identification.model_id","model.identification.category",
        "model.rated_capacity_ah","model.composition.chemistry","item.unique_identifier","item.lifecycle_status","item.state_of_health.percent"
    ]:
        require(path in dom,f"M07 canonical mapping missing: {path}")
    require('"source_format": "csv"' in dom or '&quot;source_format&quot;' in dom,"M07 saved payload format missing")
    print("M07_MAPPING_UI_PASS: 8 CSV headers auto-map to 8 canonical DPP fields and produce a valid reusable saved-mapping payload")

if __name__=="__main__": main()
