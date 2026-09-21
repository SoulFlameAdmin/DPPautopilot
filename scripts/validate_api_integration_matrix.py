#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
matrix=json.loads((ROOT/"data/api-integration-matrix.json").read_text(encoding="utf-8"))

assert matrix.get("version")==5
assert matrix.get("task")=="T03"
assert matrix.get("status")=="partial"
assert matrix.get("dependencies")==["M17","M18","M19","M20","M21","M22","M23"]

required={
  "protected_auth_boundary",
  "model_item_passport_journey",
  "import_transaction_journey",
  "export_journey",
  "semantic_not_found_errors",
  "conflicting_write_errors",
  "invalid_import_commit",
  "public_privacy_boundary",
  "passport_create_retry",
  "export_manifest_drift",
  "signed_export_manifest",
}
scenarios=matrix.get("scenarios",[])
assert {s["id"] for s in scenarios}==required, "T03 integration scenario set drifted"
for s in scenarios:
    assert s.get("covers"), f"T03 scenario {s['id']} missing task coverage"
    assert s.get("expected"), f"T03 scenario {s['id']} missing expected result"

test_path=ROOT/matrix["executable_test"]
validator_path=ROOT/matrix["validator"]
assert test_path.is_file(), f"T03 executable test missing: {test_path}"
assert validator_path.is_file(), f"T03 validator path missing: {validator_path}"

test_text=test_path.read_text(encoding="utf-8")
for token in [
  "T03_API_INTEGRATION_PRECURSOR_PASS",
  "stateful model -> item -> passport",
  "stateful import create -> validate -> commit -> repeat commit -> get journey",
  "semantic not-found and conflict errors",
  "invalid import remains non-committable",
  "private_payload",
  "IMPORT_NOT_COMMITTABLE",
  "MODEL_CONFLICT",
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
  "evidence_manifest_signed",
  "evidence_manifest_token",
  "HMAC-SHA256-v1",
]:
    assert token in test_text, f"T03 integration test missing coverage token: {token}"

for rel in ["api/models.js","api/items.js","api/passport.js","api/imports.js","api/export.js"]:
    assert (ROOT/rel).is_file(), f"T03 API surface missing: {rel}"

remaining=matrix.get("remaining",[])
assert remaining, "T03 must document deployed integration evidence still pending while partial"

print("T03_API_INTEGRATION_MATRIX_PASS: 11 positive/negative multi-surface API integration scenarios are versioned, including resumable paged evidence export, signed manifest metadata and fail-closed manifest drift detection")
