#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
matrix = json.loads((ROOT / "data/reliability-test-matrix.json").read_text(encoding="utf-8"))

assert matrix.get("version") == 1, "T08 reliability matrix version must be 1"
assert matrix.get("task") == "T08", "matrix must belong to T08"
assert matrix.get("status") == "partial", "T08 must remain partial while M23 is RED"

scenarios = matrix.get("scenarios", [])
assert len(scenarios) == 5, f"expected 5 reliability scenarios, got {len(scenarios)}"

required_ids = {
    "registry_timeout_retry",
    "import_duplicate_commit",
    "registry_duplicate_submission",
    "api_write_conflicts",
    "passport_create_retry_idempotency",
}
assert {s["id"] for s in scenarios} == required_ids, "T08 reliability scenario set changed unexpectedly"

for scenario in scenarios:
    path = ROOT / scenario["test"]
    assert path.is_file(), f"missing T08 reliability test file: {path}"
    test_text = path.read_text(encoding="utf-8")
    marker = scenario["expected_marker"]
    assert marker in test_text, f"expected PASS marker {marker} missing from {path.name}"
    assert scenario.get("covers"), f"scenario {scenario['id']} has no declared coverage"

remaining = matrix.get("remaining", [])
assert remaining, "T08 remaining dependency note is required while task is partial"

print("T08_RELIABILITY_MATRIX_PASS: retry, import/registry/passport idempotency and API conflict coverage are versioned and linked to executable tests")
