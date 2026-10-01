#!/usr/bin/env python3
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/"demo/suppliers.html").read_text(encoding="utf-8")
js=(ROOT/"assets/csp/suppliers-inline-1.js").read_text(encoding="utf-8")
sample=json.loads((ROOT/"data/sample-suppliers.json").read_text(encoding="utf-8"))

assert "Supplier Network" in html
assert "supplierRows" in html
assert "/api/suppliers" in js
assert "/data/sample-suppliers.json" in js
assert "__DPP_ACCESS_TOKEN" in js
assert sample.get("synthetic") is True
assert len(sample.get("suppliers",[]))>=3
assert all("missing_count" in x and "package_count" in x for x in sample["suppliers"])
print("BAT60_SUPPLIER_DASHBOARD_PRECURSOR_PASS")
