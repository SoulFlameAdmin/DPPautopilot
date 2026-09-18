#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/evidence-file-policy.json").read_text(encoding="utf-8"))
sql=(ROOT/"supabase/migrations/20260919009000_dpp_evidence_attachments.sql").read_text(encoding="utf-8")
assert policy.get("version")==1
assert policy.get("task")=="M13"
assert policy.get("bucket")=="dpp-evidence"
assert policy.get("max_bytes")==10_485_760
expected_types={"application/pdf","image/png","image/jpeg","text/csv","application/json"}
assert set(policy.get("allowed_content_types",[]))==expected_types
expected_targets={"battery_model","battery_item","passport","registry_submission","import_run"}
assert set(policy.get("allowed_related_record_types",[]))==expected_targets
for token in [
 "create table public.dpp_evidence_attachments","enable row level security",
 "revoke all on table public.dpp_evidence_attachments from anon,authenticated",
 "dpp_validate_evidence_target","dpp_evidence_member_select","dpp_evidence_editor_insert",
 "dpp_evidence_admin_delete","dpp_audit_evidence_attachments","10485760","^[0-9a-f]{64}$"
]:
    assert token in sql, f"M13 migration missing contract token: {token}"
for content_type in expected_types:
    assert content_type in sql
print("M13_EVIDENCE_POLICY_PASS: metadata schema, tenant policies, target integrity, MIME/size/hash/path limits and audit hook are declared")
