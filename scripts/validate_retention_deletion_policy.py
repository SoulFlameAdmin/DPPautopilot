#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/retention-deletion-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==1
assert policy.get("task")=="R08"
assert policy.get("status")=="partial"
assert policy.get("scope","").startswith("DPP Autopilot")

export=policy.get("export",{})
assert export.get("required_before_org_deletion") is True
assert "dpp_api_export_bundle" in export.get("implementation","")
assert "Evidence object bytes" in export.get("current_gap","")

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

print("R08_RETENTION_POLICY_PASS: org deletion is fail-closed; terminal import staging has a 30-day auditable purge while unresolved regulatory/storage/audit/auth rules remain explicit blockers")
