#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MATRIX=ROOT/"data/reliability-test-matrix.json"
OUTPUT=ROOT/"artifacts/t08-reliability-report.json"

matrix=json.loads(MATRIX.read_text(encoding="utf-8"))
assert matrix.get("version")==1
assert matrix.get("task")=="T08"
assert matrix.get("status")=="partial"

scenarios=matrix.get("scenarios",[])
expected=[
    "registry_timeout_retry",
    "import_duplicate_commit",
    "registry_duplicate_submission",
    "api_write_conflicts",
]
assert [s["id"] for s in scenarios]==expected, f"T08 scenario drift: {[s['id'] for s in scenarios]!r}"

resolved=[]
all_covers=set()
for scenario in scenarios:
    path=ROOT/scenario["test"]
    assert path.is_file(), f"T08 test missing: {scenario['test']}"
    text=path.read_text(encoding="utf-8")
    marker=scenario["expected_marker"]
    assert marker in text, f"T08 marker missing: {marker}"
    covers=scenario.get("covers",[])
    assert covers, f"T08 covers missing: {scenario['id']}"
    all_covers.update(covers)
    resolved.append({
        "id":scenario["id"],
        "source_task":scenario["source_task"],
        "test":scenario["test"],
        "expected_marker":marker,
        "covers":covers,
        "marker_present":True
    })

required={
    "timeout_metadata",
    "retry_wait",
    "retry_submission_count",
    "accepted_terminal_state",
    "duplicate_commit_noop",
    "same_import_serialization",
    "no_duplicate_model_item",
    "idempotency_key",
    "parallel_safe_create",
    "same_key_same_request_noop",
    "same_key_different_request_rejected",
    "model_unique_conflict_409",
    "item_unique_conflict_409",
    "passport_unique_conflict_409",
    "unexpected_db_error_fail_closed",
}
assert required<=all_covers, f"T08 reliability coverage missing: {sorted(required-all_covers)}"

report={
    "task":"T08",
    "coverage_type":"retry_idempotency_fault_injection",
    "scenario_count":len(resolved),
    "scenarios":resolved,
    "covered_behaviors":sorted(all_covers),
    "required_behaviors_covered":True,
    "remaining":matrix.get("remaining",[])
}
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
OUTPUT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(f"T08_RELIABILITY_REPORT_PASS: {len(resolved)} scenarios cover {len(all_covers)} retry/idempotency/conflict behaviors; report={OUTPUT.relative_to(ROOT)}")
