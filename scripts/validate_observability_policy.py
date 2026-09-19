#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/observability-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==3
assert policy.get("task")=="R09"
assert policy.get("status")=="partial"
assert policy.get("event_name")=="dpp_http_request"

correlation=policy.get("correlation",{})
assert correlation.get("request_header")=="X-Request-ID"
assert correlation.get("response_header")=="X-Request-ID"
assert correlation.get("invalid_or_missing")=="Generate UUID v4"

expected_fields={
    "event","timestamp_ms","request_id","surface","method","status","outcome","duration_ms","auth_present","error_code"
}
assert set(policy.get("logged_fields",[]))==expected_fields
assert policy.get("surfaces")==["tenant","models","items","passport","imports","export"]
api_surface_inventory={
    path.stem for path in (ROOT/"api").glob("*.js")
    if not path.name.startswith("_")
}
assert set(policy["surfaces"])==api_surface_inventory, f"R09 uncovered public API surface(s): {sorted(api_surface_inventory-set(policy['surfaces']))}"
assert policy.get("severity")=={"2xx_3xx":"info","4xx":"warn","5xx":"error"}
failure_mode=policy.get("failure_mode",{})
assert failure_mode.get("logging_sink")=="fail_open"
assert "original HTTP response" in failure_mode.get("response_behavior","")
assert failure_mode.get("retry_or_secondary_logging")=="none"

prohibited=" ".join(policy.get("prohibited_fields",[])).lower()
for term in ["authorization","token","supabase","bodies","query","identifier","email","cookie","ip","database"]:
    assert term in prohibited, f"R09 prohibited field policy missing {term}"

helper=(ROOT/"api/_observability.js").read_text(encoding="utf-8")
for token in [
    "crypto.randomUUID()",
    "X-Request-ID",
    "dpp_http_request",
    "auth_present",
    "error_code",
    "logger.error",
    "logger.warn",
    "logger.info",
    "catch(_)",
]:
    assert token in helper, f"R09 helper missing {token}"

for surface in policy["surfaces"]:
    source=(ROOT/f"api/{surface}.js").read_text(encoding="utf-8")
    assert "require('./_observability.js')" in source, f"{surface} missing observability helper import"
    call=f"startRequestObservability(req,res,'{surface}')"
    assert call in source, f"{surface} missing observability start"
    rate=f"enforceRateLimit(req,res,'{surface}')"
    assert source.index(call)<source.index(rate), f"{surface} correlation must start before rate limiting"

test=(ROOT/"tests/api/observability.test.cjs").read_text(encoding="utf-8")
for token in [
    "R09_OBSERVABILITY_PRECURSOR_PASS",
    "never logs bearer or submitted payload",
    "redacted 401 structured event",
    "unsafe request ids",
    "5xx uses error severity",
    "real tenant handler emits correlated redacted 401",
    "logging sink failure never blocks the response",
]:
    assert token in test, f"R09 observability suite missing {token}"

assert "F08" in policy.get("runtime_gap","")
assert "M02" in policy.get("runtime_gap","")
assert "M17-M20" in policy.get("runtime_gap","")
print("R09_OBSERVABILITY_POLICY_PASS: six inventoried API surfaces emit correlated structured metadata with explicit secret/payload redaction; deployed runtime evidence remains intentionally unclaimed")
