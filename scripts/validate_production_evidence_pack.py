#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/production-evidence-pack-policy.json").read_text(encoding="utf-8"))
plan=json.loads((ROOT/"data/master-plan.json").read_text(encoding="utf-8"))
doc=(ROOT/"docs/PRODUCTION_EVIDENCE.md").read_text(encoding="utf-8")

assert policy["version"]==1 and policy["task"]=="C14" and policy["status"]=="partial"
assert policy["output"]=="docs/PRODUCTION_EVIDENCE.md"
assert policy["dependencies"]==["C07","C08","C09","C10","C11","C12","C13"]
assert policy["decision"]["ready_when"]=="all_dependencies_green"
assert policy["decision"]["current_default"]=="not_ready"

tasks={}
for gate in plan.get("gates",[]):
    for task in gate.get("tasks",[]):
        tasks[task["id"]]=task

for dep in policy["dependencies"]:
    assert dep in tasks, dep
    assert f"| {dep} |" in doc, f"C14 document missing {dep}"

ready=all(tasks[x]["status"]=="green" for x in policy["dependencies"])
expected="**Final evidence-pack decision:** **READY**" if ready else "**Final evidence-pack decision:** **NOT READY**"
assert expected in doc, f"C14 decision drift: expected {expected}"

for rel in policy["required_repository_artifacts"]:
    assert (ROOT/rel).is_file(), f"C14 required artifact missing: {rel}"

for section in [
    "## Source of truth and CI",
    "## Database and migration evidence",
    "## Test and reliability evidence",
    "## Deployment and release evidence",
    "## Operations, recovery and security evidence",
    "## Privacy, traceability and compliance evidence",
    "## External sign-off boundaries",
    "## C14 GREEN rule",
]:
    assert section in doc, f"C14 document missing section {section}"

for token in ["C12 legal/compliance sign-off","C13 pilot customer UAT","F08 production deployment","C15 remains"]:
    assert token in doc, f"C14 external/final boundary missing {token}"

for path in [
    "scripts/generate_production_evidence_pack.py",
    "tests/unit/test_production_evidence_pack.py",
]:
    assert (ROOT/path).is_file(), path

c14=tasks["C14"]
assert c14["status"]=="red", "C14 precursor must not mark itself GREEN"
print("C14_PRODUCTION_EVIDENCE_POLICY_PASS: evidence-pack structure and fail-closed C07-C13 readiness/sign-off boundaries are versioned")
