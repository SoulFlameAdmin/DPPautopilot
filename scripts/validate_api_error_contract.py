#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
contract=json.loads((ROOT/"data/api-error-contract.json").read_text(encoding="utf-8"))
assert contract.get("version")==1
assert contract.get("task")=="M22"
assert contract.get("envelope")=={"error":{"code":"UPPER_SNAKE_CASE","message":"stable public message"}}
assert contract.get("default",{}).get("code")=="UPSTREAM_ERROR"
assert contract.get("default",{}).get("http_status")==502
assert contract.get("local_codes",{}).get("PAYLOAD_TOO_LARGE",{}).get("http_status")==413
assert contract.get("local_codes",{}).get("RATE_LIMITED",{}).get("http_status")==429

valid_status={400,401,403,404,405,409,413,422,428,429,500,502}
code_re=re.compile(r"^[A-Z][A-Z0-9_]*$")
sql_re=re.compile(r"^(?:DP\d{3}|23\d{3})$")

seen_surface_entries=0
for sqlstate,entry in contract.get("common_sqlstate",{}).items():
    assert sql_re.match(sqlstate), f"invalid common SQLSTATE {sqlstate}"
    assert entry["http_status"] in valid_status
    assert code_re.match(entry["code"])
    assert isinstance(entry["message"],str) and entry["message"].strip()
    seen_surface_entries+=1

for surface,mapping in contract.get("surfaces",{}).items():
    assert surface in {"models","items","passport","export","imports","tenant"}, f"unexpected surface {surface}"
    for sqlstate,entry in mapping.items():
        assert sql_re.match(sqlstate), f"invalid {surface} SQLSTATE {sqlstate}"
        assert entry["http_status"] in valid_status
        assert code_re.match(entry["code"])
        assert isinstance(entry["message"],str) and entry["message"].strip()
        seen_surface_entries+=1

assert seen_surface_entries>=20, "M22 API error catalog unexpectedly small"

api_names=["models","items","passport","export","imports","tenant"]
declared_codes={
    entry["code"]
    for entry in contract.get("common_sqlstate",{}).values()
} | {
    entry["code"]
    for mapping in contract.get("surfaces",{}).values()
    for entry in mapping.values()
} | set(contract.get("local_codes",{})) | {contract["default"]["code"]}

literal_code_re=re.compile(r"""code\s*:\s*['"]([A-Z][A-Z0-9_]+)['"]""")
for name in api_names:
    text=(ROOT/f"api/{name}.js").read_text(encoding="utf-8")
    literal_codes=set(literal_code_re.findall(text))
    undeclared=sorted(literal_codes-declared_codes)
    assert not undeclared, f"{name} API emits undeclared public error codes: {undeclared}"


helper=(ROOT/"api/_errors.js").read_text(encoding="utf-8")
for token in ["api-error-contract.json","mapDatabaseError","localError","errorBody","contract.default"]:
    assert token in helper, f"shared error helper missing {token}"

for name in ["models","items","passport","export","imports","tenant"]:
    text=(ROOT/f"api/{name}.js").read_text(encoding="utf-8")
    assert "require('./_errors.js')" in text, f"{name} API does not import shared M22 error helper"
    assert f"mapSharedDatabaseError('{name}'" in text, f"{name} API does not declare its shared error surface"
    assert "error.publicMessage" in text, f"{name} API does not preserve canonical public message"
    assert not re.search(r"if\s*\(\s*code\s*===?\s*['\"]DP\d{3}",text), f"{name} API still hardcodes DP SQLSTATE mapping"

print(f"M22_API_ERROR_CONTRACT_PASS: {seen_surface_entries} SQLSTATE mappings centralized across 6 API surfaces")
