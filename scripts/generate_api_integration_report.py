#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MATRIX=ROOT/"data/api-integration-matrix.json"
TEST=ROOT/"tests/api/integration.test.cjs"
OUTPUT=ROOT/"artifacts/t03-api-integration-report.json"

matrix=json.loads(MATRIX.read_text(encoding="utf-8"))
test_text=TEST.read_text(encoding="utf-8")

assert matrix.get("version")==4
assert matrix.get("task")=="T03"
assert matrix.get("status")=="partial"

dependencies=matrix.get("dependencies",[])
assert dependencies==["M17","M18","M19","M20","M21","M22","M23"]

test_names=re.findall(r"test\('([^']+)'\s*,",test_text)
expected_tests=[
    "protected API boundaries reject missing bearer before upstream",
    "stateful model -> item -> passport -> public/private -> export journey",
    "stateful import create -> validate -> commit -> repeat commit -> get journey",
    "semantic not-found and conflict errors stay stable and non-leaking",
    "invalid import remains non-committable through HTTP semantic contract",
    "resumable export detects manifest drift between pages before object fetch",
]
assert test_names==expected_tests, f"T03 executable test set drifted: {test_names!r}"

scenarios=matrix.get("scenarios",[])
assert len(scenarios)==10
covered=set()
for scenario in scenarios:
    covers=scenario.get("covers",[])
    assert covers, f"T03 scenario missing coverage: {scenario.get('id')}"
    assert set(covers)<=set(dependencies), f"T03 scenario has unknown dependency: {scenario}"
    assert scenario.get("expected"), f"T03 scenario missing expectation: {scenario.get('id')}"
    covered.update(covers)

assert covered==set(dependencies), f"T03 dependency coverage incomplete: {sorted(covered)}"

required_tokens=[
    "AUTH_REQUIRED",
    "MODEL_NOT_FOUND",
    "PASSPORT_NOT_FOUND",
    "IMPORT_NOT_FOUND",
    "MODEL_CONFLICT",
    "IMPORT_NOT_COMMITTABLE",
    "private_payload",
    "already_committed",
    "PASSPORT_CONFLICT",
    "passportCreateWrites",
    "signed_url",
    "passport_versions",
    "evidence_manifest",
    "include_evidence",
    "evidence_objects",
    "sha256_verified",
    "content_base64",
    "evidence_offset",
]
for token in required_tokens:
    assert token in test_text, f"T03 integration suite missing token {token}"

surfaces=["models","items","passport","imports","export"]
for surface in surfaces:
    assert (ROOT/f"api/{surface}.js").is_file(), f"T03 API surface missing: {surface}"

report={
    "task":"T03",
    "coverage_type":"stateful_in_process_api_integration_with_resumable_evidence_export",
    "dependencies":dependencies,
    "dependency_count":len(dependencies),
    "scenario_count":len(scenarios),
    "scenarios":scenarios,
    "executable_test_count":len(test_names),
    "executable_tests":test_names,
    "api_surfaces":surfaces,
    "stable_contract_tokens":required_tokens,
    "all_m17_m23_dependencies_mapped":True,
    "remaining":matrix.get("remaining",[])
}
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
OUTPUT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(f"T03_API_INTEGRATION_REPORT_PASS: {len(scenarios)} scenarios cover {len(dependencies)} M17-M23 dependencies across {len(surfaces)} API surfaces with resumable paged evidence export and manifest-drift rejection; report={OUTPUT.relative_to(ROOT)}")
