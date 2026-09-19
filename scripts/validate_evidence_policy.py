#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/evidence-file-policy.json").read_text(encoding="utf-8"))
meta_sql=(ROOT/"supabase/migrations/20260919009000_dpp_evidence_attachments.sql").read_text(encoding="utf-8")
storage_sql=(ROOT/"supabase/migrations/20260919027000_dpp_evidence_storage.sql").read_text(encoding="utf-8")
fix_sql=(ROOT/"supabase/migrations/20260919028000_dpp_evidence_storage_policy_fix.sql").read_text(encoding="utf-8")
guard_sql=(ROOT/"supabase/migrations/20260919038000_dpp_evidence_storage_registration_tenant_guard.sql").read_text(encoding="utf-8")

assert policy.get("version")==4
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
    assert token in meta_sql, f"M13 metadata migration missing contract token: {token}"

storage=policy["storage"]
assert storage["private_bucket"] is True
assert storage["metadata_registration_required_before_upload"] is True
assert storage["read_roles"]==["owner","admin","editor","viewer"]
assert storage["upload_roles"]==["owner","admin","editor"]
assert storage["delete_roles"]==["owner","admin"]
assert storage["update_overwrite_allowed"] is False
assert storage["hosted_migrations"]==[
  "supabase/migrations/20260919027000_dpp_evidence_storage.sql",
  "supabase/migrations/20260919028000_dpp_evidence_storage_policy_fix.sql",
  "supabase/migrations/20260919038000_dpp_evidence_storage_registration_tenant_guard.sql"
]
assert storage["metadata_registration_tenant_guard"] is True
assert storage["metadata_registration_helper"]=="public.dpp_evidence_storage_registered(text)"

for token in [
 "dpp_evidence_storage_org_id",
 "insert into storage.buckets",
 "'dpp-evidence'",
 "false",
 "10485760",
 "dpp_evidence_storage_member_select",
 "dpp_evidence_storage_editor_insert",
 "dpp_evidence_storage_admin_delete",
 "M13_STORAGE_SCHEMA_UNAVAILABLE_SKIP"
]:
    assert token in storage_sql, f"M13 storage migration missing contract token: {token}"

for token in [
 "dpp_evidence_storage_registered",
 "security definer",
 "revoke all on function public.dpp_evidence_storage_registered(text) from public,anon",
 "grant execute on function public.dpp_evidence_storage_registered(text) to authenticated",
 "dpp_evidence_storage_member_select",
 "dpp_evidence_storage_editor_insert"
]:
    assert token.lower() in fix_sql.lower(), f"M13 storage fix missing contract token: {token}"

assert "from public.dpp_evidence_attachments" in fix_sql
assert "dpp_evidence_storage_registered(name)" in fix_sql
for token in [
 "dpp_evidence_storage_registered",
 "dpp_has_org_role",
 "array['owner','admin','editor','viewer']",
 "from public.dpp_evidence_attachments",
 "revoke all on function public.dpp_evidence_storage_registered(text) from public,anon"
]:
    assert token.lower() in guard_sql.lower(), f"M13 tenant guard migration missing contract token: {token}"

for content_type in expected_types:
    assert content_type in meta_sql and content_type in storage_sql

print("M13_EVIDENCE_POLICY_PASS: tenant metadata plus private Storage bucket/RLS, tenant-guarded SECURITY DEFINER registration predicate, MIME/size/path/hash limits and no-overwrite integrity contract are declared")
