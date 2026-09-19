#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
matrix=json.loads((ROOT/"data/api-input-validation-matrix.json").read_text(encoding="utf-8"))
assert matrix.get("version")==3
assert matrix.get("task")=="R03"
assert matrix.get("status")=="partial"
assert matrix.get("max_body_bytes")==1048576

required={
  "oversize_parsed_tenant_body","oversize_parsed_model_body","oversize_parsed_item_body","oversize_parsed_passport_body","oversize_parsed_import_body",
  "oversize_string_body","oversize_buffer_body","malformed_json","invalid_tenant_fields","invalid_model_fields",
  "invalid_item_fields","invalid_passport_fields","invalid_import_fields","evidence_file_policy",
}
scenarios=matrix.get("scenarios",[])
assert {s["id"] for s in scenarios}==required, "R03 API validation scenario set drifted"
for s in scenarios:
    assert s.get("surface") and s.get("expected")

for rel in matrix.get("evidence_files",[]):
    assert (ROOT/rel).is_file(), f"R03 evidence file missing: {rel}"

request=(ROOT/"api/_request.js").read_text(encoding="utf-8")
for token in ["MAX_BODY_BYTES = 1024 * 1024","Buffer.isBuffer","JSON.stringify(value)","PAYLOAD_TOO_LARGE","INVALID_JSON"]:
    assert token in request, f"R03 request limiter missing {token}"

covered_body_files={"tenant.js","models.js","items.js","passport.js","imports.js"}
body_surface_inventory={
    path.name
    for path in (ROOT/"api").glob("*.js")
    if not path.name.startswith("_") and "parseBody(" in path.read_text(encoding="utf-8")
}
assert body_surface_inventory==covered_body_files, (
    f"R03 body-parser surface drift: discovered={sorted(body_surface_inventory)} covered={sorted(covered_body_files)}"
)
for rel in [f"api/{name}" for name in sorted(covered_body_files)]:
    text=(ROOT/rel).read_text(encoding="utf-8")
    assert "require('./_request.js')" in text, f"{rel} is not using shared R03 body limiter"
    assert "bodyErrorResponse" in text, f"{rel} does not emit typed body errors"

contract=json.loads((ROOT/"data/api-error-contract.json").read_text(encoding="utf-8"))
too_large=contract.get("local_codes",{}).get("PAYLOAD_TOO_LARGE",{})
assert too_large.get("http_status")==413
assert too_large.get("message")=="Request body exceeds the 1 MiB limit."

policy=json.loads((ROOT/"data/evidence-file-policy.json").read_text(encoding="utf-8"))
assert policy.get("max_bytes")==10485760
assert policy.get("allowed_content_types")
assert policy.get("sha256_format")

api_test=(ROOT/"tests/api/input-validation.test.cjs").read_text(encoding="utf-8")
assert "R03_API_INPUT_VALIDATION_SUBSET_PASS" in api_test
assert "upstream must not be called" in api_test

remaining=matrix.get("remaining",[])
assert len(remaining)==1 and "Storage API byte" in remaining[0], "R03 must retain only the real M13 Storage byte-path gap while partial"

print("R03_API_INPUT_VALIDATION_CONTRACT_PASS: 1 MiB shared body limit + 14 negative API/file-policy scenarios are versioned; inventoried body surfaces including M20 imports are covered")
