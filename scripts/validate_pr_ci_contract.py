#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
contract=json.loads((ROOT/"data/pr-ci-contract.json").read_text(encoding="utf-8"))
workflow=(ROOT/contract["workflow"]).read_text(encoding="utf-8")

assert contract.get("version")==1
assert contract.get("task")=="C01"
assert contract.get("status")=="partial"
assert contract.get("workflow")==".github/workflows/ci.yml"

expected=contract["expected"]
assert expected["triggers"]==["push:main","pull_request"]
assert expected["permissions"]=={"contents":"read"}
assert expected["job"]=="validate"
assert expected["timeout_minutes"]==10
assert expected["postgres_image"]=="postgres:17"

for token in [
    "on:",
    "  push:",
    "    branches: [main]",
    "  pull_request:",
    "permissions:",
    "  contents: read",
    "  validate:",
    "    timeout-minutes: 10",
    "        image: postgres:17",
]:
    assert token in workflow, f"C01 workflow missing contract token: {token}"

for forbidden in [
    "contents: write",
    "actions: write",
    "deployments: write",
    "id-token: write",
    "pull-requests: write",
]:
    assert forbidden not in workflow, f"C01 workflow unexpectedly grants {forbidden}"

for step in expected["required_steps"]:
    assert f"- name: {step}" in workflow, f"C01 required CI step missing: {step}"

rules=contract["branch_rules_evidence"]
assert rules["repository_rulesets_count"]==0
assert rules["branch_protection_read"]=="unavailable_to_integration_403"
assert "No merge-blocking" in rules["claim"]

probe=contract["probe"]
assert probe=={
    "type":"draft_pull_request",
    "base":"main",
    "expected_event":"pull_request",
    "expected_workflow":"CI",
    "expected_job":"validate",
    "merge":False,
    "close_after_evidence":True,
}

remaining=" ".join(contract["remaining"])
assert "T01-T04" in remaining
assert "pull_request-triggered" in remaining
assert "branch protection" in remaining.lower() or "ruleset" in remaining.lower()

print("C01_PR_CI_CONTRACT_PASS: pull_request CI trigger, read-only permissions and required validation/test steps are versioned; merge-blocking branch-rule enforcement remains explicitly unclaimed")
