#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/retention-deletion-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==2
assert policy.get("task")=="R08"
assert policy.get("status")=="partial"
assert policy.get("scope","").startswith("DPP Autopilot")

export=policy.get("export",{})
assert export.get("required_before_org_deletion") is True
assert "dpp_api_export_bundle" in export.get("implementation","")
precursor=export.get("evidence_bytes_precursor",{})
assert precursor.get("endpoint")=="GET /api/export?include_evidence=1"
assert precursor.get("integrity")=="byte_size + SHA-256 verified against evidence_manifest before inclusion"
assert precursor.get("encoding")=="base64"
assert precursor.get("inline_limit_bytes")==26_214_400
assert "fail closed" in precursor.get("failure_mode","")
assert "bounded precursor" in export.get("current_gap","")

rules={r["id"]:r for r in policy.get("retention_rules",[])}
expected={
    "import_terminal_staging",
    "passport_history",
    "registry_history",
    "evidence_objects",
    "audit_history",
    "auth_identity",
}
assert set(rules)==expected
assert rules["import_terminal_staging"]["implemented"] is True
assert rules["import_terminal_staging"]["minimum_age_days"]==30
assert rules["import_terminal_staging"]["terminal_statuses"]==["invalid","committed"]
assert rules["passport_history"]["implemented"] is False
assert rules["registry_history"]["implemented"] is False
assert rules["evidence_objects"]["implemented"] is False
assert rules["audit_history"]["implemented"] is False
assert rules["auth_identity"]["implemented"] is False

org=policy.get("org_deletion",{})
assert org.get("enabled") is False
assert org.get("fail_closed") is True
assert org.get("readiness_rpc")=="dpp_api_retention_status()"
assert len(org.get("blockers",[]))>=6
assert any("evidence-byte export/package acceptance" in x for x in org.get("blockers",[]))

actions=policy.get("implemented_actions",{})
assert actions.get("import_staging_purge_rpc")=="dpp_api_purge_import_staging(timestamptz)"
assert actions.get("roles")==["owner","admin"]
assert actions.get("minimum_age_days")==30
assert actions.get("auditable") is True

sql=(ROOT/"supabase/migrations/20260919026000_dpp_retention_deletion_precursor.sql").read_text(encoding="utf-8")
for token in [
    "dpp_api_retention_status()",
    "organization_deletion_enabled',false",
    "dpp_api_purge_import_staging",
    "r.status in ('invalid','committed')",
    "r.status in ('staged','validated')",
    "interval '30 days'",
    "using errcode='DP502'",
    "dpp_require_active_role(array['owner','admin'])",
]:
    assert token in sql, f"R08 migration missing {token}"

test=(ROOT/"tests/db/test_retention_deletion_subset.sql").read_text(encoding="utf-8")
for token in [
    "R08_RETENTION_DELETION_SUBSET_PASS",
    "terminal old imports were not purged",
    "preserved imports were incorrectly deleted",
    "immutable audit trail missing purge deletes",
    "viewer purge was not denied",
    "destructive org deletion surface unexpectedly available",
]:
    assert token in test, f"R08 integration test missing {token}"

export_api=(ROOT/"api/export.js").read_text(encoding="utf-8")
export_test=(ROOT/"tests/api/export.test.cjs").read_text(encoding="utf-8")
for token in [
    "include_evidence",
    "inlineEvidenceBytes",
    "MAX_INLINE_EVIDENCE_BYTES",
    "EVIDENCE_EXPORT_TOO_LARGE",
    "EVIDENCE_EXPORT_INTEGRITY_FAILED",
    "EVIDENCE_EXPORT_OBJECT_UNAVAILABLE",
    "sha256",
    "content_base64",
]:
    assert token in export_api, f"R08/M21 evidence byte export missing {token}"
for token in [
    "include_evidence downloads bytes through caller-JWT bridge and verifies integrity",
    "include_evidence fails closed on hash mismatch",
    "include_evidence rejects declared total beyond inline memory limit",
    "include_evidence maps unavailable object to stable export error",
]:
    assert token in export_test, f"R08/M21 export regression missing {token}"

print("R08_RETENTION_POLICY_PASS: org deletion remains fail-closed; terminal staging purge and bounded integrity-checked evidence-byte export precursors are implemented while regulatory/storage/audit/auth acceptance blockers remain explicit")
