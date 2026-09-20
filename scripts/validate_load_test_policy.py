#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/load-test-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==2
assert policy.get("task")=="T07"
assert policy.get("status")=="partial"
assert policy.get("mode")=="synthetic_in_process_serverless_handler_load"
assert "not production capacity" in policy.get("claim_boundary","").lower()

profiles=policy.get("profiles",{})
assert set(profiles)=={"multi_surface_concurrency","import_batch_volume","same_client_read_overload","shared_authenticated_concurrency"}

multi=profiles["multi_surface_concurrency"]
assert multi["total_requests"]==200
assert multi["concurrency"]==25
assert multi["requests_per_surface"]==40
assert multi["surfaces"]==["models","items","passport","imports","export"]
assert multi["max_error_rate"]==0
assert multi["max_p95_ms"]>=1000
assert multi["max_wall_ms"]>=5000

volume=profiles["import_batch_volume"]
assert volume["rows"]==1000
assert volume["expected_status"]==201

overload=profiles["same_client_read_overload"]
assert overload["requests"]==125
assert overload["configured_budget"]==120
assert overload["expected_successes"]==120
assert overload["expected_rate_limited"]==5
assert overload["expected_rate_limit_status"]==429

shared=profiles["shared_authenticated_concurrency"]
assert shared["requests"]==50
assert shared["concurrency"]==25
assert shared["configured_budget"]==40
assert shared["expected_allowed"]==40
assert shared["expected_denied"]==10
assert shared["expected_shared_rpc_calls"]==100
assert shared["expected_buckets_per_request"]==2
assert shared["rule"]=="authenticated_write"
assert shared["surface"]=="models"

test=(ROOT/"tests/api/load.test.cjs").read_text(encoding="utf-8")
for token in [
    "T07_SYNTHETIC_LOAD_PRECURSOR_PASS",
    "multi_surface_concurrency",
    "import_batch_volume",
    "same_client_read_overload",
    "t07-load-report.json",
    "p95_ms",
    "rate_limited",
    "shared_authenticated_concurrency",
    "checkSharedRateLimit",
    "shared_rpc_calls",
    "shared_bucket_count",
]:
    assert token in test, f"T07 load suite missing {token}"

for surface in ["models","items","passport","imports","export"]:
    assert (ROOT/f"api/{surface}.js").is_file()

remaining=" ".join(policy.get("remaining",[]))
assert "M17-M21" in remaining
assert "deployed preview/staging" in remaining
assert "shared limiter backend" in remaining
print("T07_LOAD_POLICY_PASS: synthetic handler concurrency, 1000-row import volume, deterministic local overload shedding and atomic shared-authenticated limiter concurrency are versioned; production capacity remains explicitly unclaimed")
