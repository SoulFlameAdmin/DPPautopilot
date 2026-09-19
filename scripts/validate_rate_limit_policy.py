#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/rate-limit-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==1
assert policy.get("task")=="R05"
assert policy.get("status")=="partial"
assert policy.get("strategy")=="process_local_fixed_window_precursor"

rules=policy.get("rules",{})
expected_rules={
    "public_passport_read":(30,60),
    "authenticated_read":(120,60),
    "authenticated_write":(40,60),
    "export_read":(20,60),
    "import_write":(20,60),
}
assert set(rules)==set(expected_rules)
for name,(limit,window) in expected_rules.items():
    assert rules[name]["limit"]==limit
    assert rules[name]["window_seconds"]==window

surfaces=policy.get("surfaces",{})
assert set(surfaces)=={"models","items","passport","imports","export"}

response=policy.get("response",{})
assert response.get("http_status")==429
assert response.get("code")=="RATE_LIMITED"
assert "Retry-After" in response.get("headers",[])
assert "X-RateLimit-Limit" in response.get("headers",[])
assert "X-RateLimit-Remaining" in response.get("headers",[])
assert "X-RateLimit-Reset" in response.get("headers",[])

helper=(ROOT/"api/_rate_limit.js").read_text(encoding="utf-8")
for token in [
    "createHash('sha256')",
    "process_local_fixed_window_precursor" if False else "checkRateLimit",
    "Retry-After",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
]:
    assert token in helper, f"R05 helper missing {token}"

for surface in ["models","items","passport","imports","export"]:
    text=(ROOT/f"api/{surface}.js").read_text(encoding="utf-8")
    assert "require('./_rate_limit.js')" in text, f"{surface} does not import R05 limiter"
    call=f"enforceRateLimit(req,res,'{surface}')"
    assert call in text, f"{surface} does not enforce R05 limiter"
    assert text.index(call) < text.index("await rpc(") if "await rpc(" in text else True

contract=json.loads((ROOT/"data/api-error-contract.json").read_text(encoding="utf-8"))
assert contract["local_codes"]["RATE_LIMITED"]=={
    "http_status":429,
    "message":"Too many requests. Retry later."
}

test_path=ROOT/"tests/api/rate-limit.test.cjs"
assert test_path.is_file()
test_text=test_path.read_text(encoding="utf-8")
for token in [
    "R05_RATE_LIMIT_PRECURSOR_PASS",
    "41st authenticated model write",
    "31st anonymous public passport read",
    "RATE_LIMITED",
    "retry-after",
]:
    assert token in test_text, f"R05 abuse suite missing {token}"

limitations=policy.get("limitations",[])
assert any("parallel serverless isolates" in x for x in limitations)
assert any("shared durable limiter" in x for x in limitations)

print("R05_RATE_LIMIT_POLICY_PASS: five API surfaces have versioned process-local abuse budgets, canonical 429 behavior and explicit distributed-runtime limitation")
