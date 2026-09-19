#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/"data/final-acceptance-policy.json").read_text(encoding="utf-8"))

assert p["version"]==1 and p["task"]=="C15" and p["status"]=="partial"
assert p["required_gates"]==["FOUNDATION","DEMO","MVP","UX","SECURITY","TESTING","RELEASE"]
assert p["release_tasks_through"]=="C14"
assert p["excluded_gates"]==["EXPANSION"]
a=p["acceptance"]
for key in [
    "require_every_mandatory_task_green","require_c14_green","require_production_evidence_pack_ready",
    "require_no_blocked_mandatory_tasks","require_no_red_mandatory_tasks",
    "require_no_failing_mandatory_ci","require_production_verified"
]:
    assert a[key] is True
assert p["decision"]["complete"]=="PROJECT_100_PERCENT_COMPLETE"
assert p["decision"]["incomplete"]=="NOT_COMPLETE"
assert p["decision"]["default"]=="NOT_COMPLETE"
assert p["output"]=="artifacts/c15-final-audit.json"
boundaries=" ".join(p["boundaries"])
for token in ["Expansion","C15 may not override","production verification","C14 evidence pack"]:
    assert token.lower() in boundaries.lower()
for path in [
    "scripts/final_acceptance_audit.py",
    "tests/unit/test_final_acceptance.py",
    "docs/C15_FINAL_ACCEPTANCE_PROGRESS.md",
    "docs/PRODUCTION_EVIDENCE.md",
]:
    assert (ROOT/path).is_file(), path
print("C15_FINAL_ACCEPTANCE_POLICY_PASS: mandatory pre-production/release GREEN, C14 READY, final CI and exact production verification are required fail-closed")
