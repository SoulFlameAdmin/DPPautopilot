#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "data/import-error-contract.json").read_text(encoding="utf-8"))
sql = "\n".join(
    (ROOT / path).read_text(encoding="utf-8")
    for path in [
        "supabase/migrations/20260919005000_dpp_import_error_contract.sql",
        "supabase/migrations/20260919025000_dpp_imports_api.sql",
    ]
)

errors = catalog.get("errors", [])
assert catalog.get("version") == 1, "M22 error contract version must be 1"
assert len(errors) == 10, f"M22 expected 10 import errors, got {len(errors)}"

sqlstates = [e["sqlstate"] for e in errors]
codes = [e["code"] for e in errors]
assert len(sqlstates) == len(set(sqlstates)), "M22 duplicate SQLSTATE"
assert len(codes) == len(set(codes)), "M22 duplicate semantic error code"

for entry in errors:
    state = entry["sqlstate"]
    code = entry["code"]
    status = entry["intended_http_status"]
    assert len(state) == 5 and state.startswith("DP"), f"invalid custom SQLSTATE: {state}"
    assert state in sql, f"migration missing SQLSTATE {state}"
    assert code and code == code.lower(), f"invalid semantic code: {code}"
    assert status in {404, 409, 422}, f"unexpected intended HTTP status: {status}"

print("M22_IMPORT_ERROR_CONTRACT_PASS: DP001-DP010 are unique, catalogued and implemented across the import DB/API boundary")
