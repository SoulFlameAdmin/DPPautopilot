#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/retention-deletion-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==7
assert policy.get("task")=="R08"
assert policy.get("status")=="partial"
assert policy.get("scope","").startswith("DPP Autopilot")

export=policy.get("export",{})
assert export.get("required_before_org_deletion") is True
assert "dpp_api_export_bundle" in export.get("implementation","")
precursor=export.get("evidence_bytes_precursor",{})
assert precursor.get("endpoint")=="GET /api/export?include_evidence=1[&evidence_offset=N&evidence_limit=N][&evidence_manifest_signed=1][&evidence_manifest_token=TOKEN][&format=ndjson]"
assert precursor.get("integrity")=="byte_size + SHA-256 verified against evidence_manifest before inclusion"
assert precursor.get("encoding")=="base64"
assert precursor.get("inline_limit_bytes")==26_214_400
assert "fail closed" in precursor.get("failure_mode","")
pagination=precursor.get("pagination",{})
assert pagination.get("offset_param")=="evidence_offset"
assert pagination.get("limit_param")=="evidence_limit"
assert pagination.get("default_limit_when_paged")==25
assert pagination.get("max_limit")==100
assert pagination.get("byte_cap_scope")=="selected page only"
for field in ["manifest_object_count","offset","limit","has_more","next_offset"]:
    assert field in pagination.get("page_metadata",[]), f"R08 evidence pagination missing {field}"
resume=pagination.get("resume_manifest_sha256",{})
assert resume.get("query_param")=="evidence_manifest_sha256"
assert resume.get("response_field")=="manifest_sha256"
assert resume.get("algorithm")=="SHA-256 over canonicalized evidence manifest identity/size/hash tuples"
assert resume.get("mismatch_status")==409
assert resume.get("mismatch_code")=="EVIDENCE_EXPORT_MANIFEST_CHANGED"
assert resume.get("invalid_status")==400
assert resume.get("invalid_code")=="EVIDENCE_EXPORT_MANIFEST_INVALID"
assert resume.get("failure_stage")=="before evidence object download"
signed=pagination.get("signed_resume_manifest",{})
assert signed.get("request_flag")=="evidence_manifest_signed"
assert signed.get("request_token_param")=="evidence_manifest_token"
assert signed.get("response_token_field")=="manifest_token"
assert signed.get("response_algorithm_field")=="manifest_signature_algorithm"
assert signed.get("algorithm")=="HMAC-SHA256-v1 over canonical manifest SHA-256"
assert signed.get("signing_key_env")=="DPP_EXPORT_MANIFEST_SIGNING_KEY"
assert signed.get("minimum_signing_key_bytes")==32
assert signed.get("tamper_status")==400
assert signed.get("tamper_code")=="EVIDENCE_EXPORT_MANIFEST_TOKEN_INVALID"
assert signed.get("signing_unavailable_status")==500
assert signed.get("signing_unavailable_code")=="EVIDENCE_EXPORT_SIGNING_UNAVAILABLE"
assert signed.get("manifest_drift_status")==409
assert signed.get("manifest_drift_code")=="EVIDENCE_EXPORT_MANIFEST_CHANGED"
assert signed.get("failure_stage")=="before evidence object download"
streaming=export.get("streaming_package_precursor",{})
assert streaming.get("query")=="format=ndjson"
assert streaming.get("media_type")=="application/x-ndjson; charset=utf-8"
assert streaming.get("package_version")=="ndjson-v1"
assert streaming.get("content_disposition")=='attachment; filename="dpp-export.ndjson"'
assert streaming.get("record_order")==[
    "dpp_export_header",
    "dpp_bundle",
    "dpp_evidence (zero or more)",
    "dpp_export_end",
]
assert streaming.get("evidence_encoding")=="base64"
assert "verified before the first NDJSON record is emitted" in streaming.get("integrity_gate","")
assert streaming.get("signed_resume_compatible") is True
assert "constant-memory object streaming" in streaming.get("current_limit","")
assert "constant-memory object streaming/final archive packaging" in export.get("current_gap","")

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
assert org.get("impact_preview_rpc")=="dpp_api_org_deletion_impact()"
impact=org.get("impact_preview",{})
assert impact.get("destructive") is False
assert impact.get("roles")==["owner","admin"]
assert impact.get("external_storage_enumeration_required") is True
assert impact.get("auth_users_deleted_by_org_delete") is False
assert impact.get("ready_for_destructive_delete") is False
for field in [
    "organization_members","distinct_member_users","active_tenant_contexts",
    "battery_models","battery_items","passports","passport_versions",
    "import_mappings","import_runs","import_rows","registry_submissions",
    "evidence_metadata","evidence_declared_bytes","audit_rows",
]:
    assert field in impact.get("counts",[]), f"R08 impact preview missing {field}"
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
    "MAX_EVIDENCE_PAGE_LIMIT",
    "EVIDENCE_EXPORT_TOO_LARGE",
    "EVIDENCE_EXPORT_INTEGRITY_FAILED",
    "EVIDENCE_EXPORT_OBJECT_UNAVAILABLE",
    "EVIDENCE_EXPORT_PAGINATION_INVALID",
    "sha256",
    "content_base64",
    "evidencePageOptions",
    "next_offset",
    "has_more",
    "evidenceManifestSha256",
    "responseContentType",
    "responseContentLength",
    "ndjsonPackageRequested",
    "sendNdjsonPackage",
    "application/x-ndjson",
    "dpp_export_header",
    "dpp_evidence",
    "dpp_export_end",
    "signEvidenceManifestToken",
    "verifyEvidenceManifestToken",
    "DPP_EXPORT_MANIFEST_SIGNING_KEY",
    "EVIDENCE_EXPORT_MANIFEST_TOKEN_INVALID",
    "EVIDENCE_EXPORT_SIGNING_UNAVAILABLE",
]:
    assert token in export_api, f"R08/M21 evidence byte export missing {token}"
for token in [
    "include_evidence downloads bytes through caller-JWT bridge and verifies integrity",
    "include_evidence fails closed on hash mismatch",
    "include_evidence fails closed on content type mismatch before bytes are read",
    "include_evidence fails closed on content length mismatch before bytes are read",
    "ndjson package emits versioned verified bundle evidence and trailer records",
    "ndjson package fails closed before first record on evidence integrity mismatch",
    "include_evidence rejects declared total beyond inline memory limit",
    "include_evidence maps unavailable object to stable export error",
    "paged include_evidence fetches only selected manifest slice",
    "paged include_evidence validates pagination before export RPC",
    "paged include_evidence ignores unselected oversized manifest objects",
    "manifest consistency token allows deterministic resume",
    "signed manifest token supports deterministic paged resume",
    "signed manifest token rejects tampering before evidence object download",
    "signed manifest request fails closed when signing key is unavailable",
]:
    assert token in export_test, f"R08/M21 export regression missing {token}"

print("R08_RETENTION_POLICY_PASS: org deletion remains fail-closed; deterministic paged/resumable integrity-checked evidence export now includes opt-in HMAC-signed manifest tokens and a versioned fail-closed NDJSON package precursor while constant-memory/final-archive/runtime/regulatory/storage/audit/auth blockers remain explicit")
