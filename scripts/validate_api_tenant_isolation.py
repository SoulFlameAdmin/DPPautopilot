#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
matrix=json.loads((ROOT/"data/api-tenant-isolation-matrix.json").read_text(encoding="utf-8"))
assert matrix.get("version")==1
assert matrix.get("task")=="R04"
assert matrix.get("status")=="partial"

scenarios=matrix.get("scenarios",[])
required={
  "models_tenant_injection",
  "items_tenant_injection",
  "passport_tenant_injection",
  "export_tenant_injection",
  "guessed_model_id",
  "guessed_item_id",
  "guessed_passport_id",
  "export_role_denial",
  "public_passport_allowlist",
}
assert {s["id"] for s in scenarios}==required, "R04 API tenant isolation scenario set drifted"
for s in scenarios:
    assert s.get("surface"), f"R04 scenario {s['id']} missing surface"
    assert s.get("expected"), f"R04 scenario {s['id']} missing expected outcome"

for rel in matrix.get("evidence_files",[]):
    path=ROOT/rel
    assert path.is_file(), f"R04 evidence file missing: {rel}"

api_test=(ROOT/"tests/api/tenant-isolation.test.cjs").read_text(encoding="utf-8")
assert "R04_API_TENANT_ISOLATION_SUBSET_PASS" in api_test
assert "private_payload" in api_test
assert "organization_id" in api_test
assert "MODEL_NOT_FOUND" in api_test
assert "ITEM_NOT_FOUND" in api_test
assert "PASSPORT_NOT_FOUND" in api_test
assert "FORBIDDEN" in api_test

passport=(ROOT/"api/passport.js").read_text(encoding="utf-8")
assert "sanitizePublicPassport" in passport
assert "private_payload" not in passport[passport.index("function sanitizePublicPassport"):passport.index("function mapDatabaseError")], "public passport sanitizer must not allow private_payload"

remaining=matrix.get("remaining",[])
assert remaining, "R04 must document remaining deployed attack evidence while partial"

print("R04_API_TENANT_ISOLATION_CONTRACT_PASS: 9 API attack scenarios + public response allowlist are versioned")
