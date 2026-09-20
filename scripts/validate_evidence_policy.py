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
edge_fn=(ROOT/"supabase/functions/dpp-evidence-object/index.ts").read_text(encoding="utf-8")

assert policy.get("version")==7
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
edge=storage["edge_function"]
assert edge["name"]=="dpp-evidence-object"
assert edge["source"]=="supabase/functions/dpp-evidence-object/index.ts"
assert edge["verify_jwt"] is True
assert edge["privileged_server_key_allowed"] is False
assert edge["operations"]==["upload","download","delete"]
assert edge["overwrite_allowed"] is False
assert edge["runtime_acceptance_required"] is True
integrity=edge["upload_integrity"]
assert integrity["metadata_lookup"]=="caller-RLS SELECT from dpp_evidence_attachments by storage_bucket + storage_path"
assert integrity["verifies"]==["byte_size","sha256_hex","content_type"]
assert integrity["hash"]=="SHA-256 via Web Crypto"
assert integrity["mismatch_status"]==409
assert integrity["mismatch_code"]=="EVIDENCE_METADATA_MISMATCH"
assert integrity["missing_metadata_status"]==403
assert integrity["missing_metadata_code"]=="EVIDENCE_METADATA_NOT_AVAILABLE"
assert integrity["verify_before_storage_upload"] is True
download_integrity=edge["download_integrity"]
assert download_integrity["metadata_lookup"]=="caller-RLS SELECT from dpp_evidence_attachments by storage_bucket + storage_path"
assert download_integrity["verifies"]==["byte_size","sha256_hex","content_type"]
assert download_integrity["hash"]=="SHA-256 via Web Crypto"
assert download_integrity["mismatch_status"]==409
assert download_integrity["mismatch_code"]=="EVIDENCE_DOWNLOAD_INTEGRITY_FAILED"
assert download_integrity["missing_metadata_status"]==404
assert download_integrity["missing_metadata_code"]=="EVIDENCE_NOT_AVAILABLE"
assert download_integrity["verify_before_response"] is True

for token in [
 "npm:@supabase/supabase-js@2.95.0",
 "SUPABASE_URL",
 "SUPABASE_ANON_KEY",
 'req.headers.get("Authorization")',
 "client.auth.getUser(token)",
 '.storage.from(BUCKET).upload(',
 "upsert: false",
 '.storage.from(BUCKET).download(',
 '.storage.from(BUCKET).remove([',
 "EVIDENCE_PATH_INVALID",
 "EVIDENCE_TYPE_NOT_ALLOWED",
 "EVIDENCE_TOO_LARGE",
 "EVIDENCE_UPLOAD_DENIED",
 "EVIDENCE_DELETE_DENIED",
 "sha256Hex",
 '.from("dpp_evidence_attachments")',
 '.select("byte_size,sha256_hex,content_type")',
 '.eq("storage_bucket", BUCKET)',
 '.eq("storage_path", path)',
 "EVIDENCE_METADATA_NOT_AVAILABLE",
 "EVIDENCE_METADATA_MISMATCH",
 "loadEvidenceMetadata",
 'crypto.subtle.digest("SHA-256", bytes)',
]:
    assert token in edge_fn, f"M13 Edge Function missing contract token: {token}"

metadata_lookup_pos=edge_fn.index('.from("dpp_evidence_attachments")')
hash_pos=edge_fn.index('const actualSha256 = await sha256Hex(bytes)')
upload_pos=edge_fn.index('.storage.from(BUCKET).upload(')
assert 0 <= metadata_lookup_pos < hash_pos < upload_pos, "M13 metadata/hash verification must happen before Storage upload"

download_pos=edge_fn.index('.storage.from(BUCKET).download(')
download_integrity_pos=edge_fn.index('EVIDENCE_DOWNLOAD_INTEGRITY_FAILED')
response_pos=edge_fn.index('return new Response(bytes, { status: 200, headers })')
assert 0 <= download_pos < download_integrity_pos < response_pos, "M13 download integrity verification must happen before byte response"

for forbidden in ["SERVICE_ROLE", "service_role", "SUPABASE_SERVICE_ROLE_KEY"]:
    assert forbidden not in edge_fn, f"M13 Edge Function must not use privileged key material: {forbidden}"

for content_type in expected_types:
    assert content_type in edge_fn, f"M13 Edge Function missing allowed content type: {content_type}"
assert "10_485_760" in edge_fn

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

print("M13_EVIDENCE_POLICY_PASS: tenant metadata plus private Storage bucket/RLS, tenant-guarded registration, caller-JWT Edge Function, pre-upload and pre-response download byte-size/SHA-256/content-type verification, MIME/size/path limits and no-overwrite integrity contract are declared")
