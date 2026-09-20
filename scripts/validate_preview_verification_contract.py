#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
contract=json.loads((ROOT/"data/preview-verification-contract.json").read_text(encoding="utf-8"))

assert contract.get("version")==1
assert contract.get("task")=="C02"
assert contract.get("status")=="partial"

canonical=contract["canonical_vercel"]
assert canonical["project_id"]=="prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr"
assert canonical["project_name"]=="dpp-autopilot"
assert canonical["observed_deployments"]>=1

observed=contract["observed_preview"]
assert observed["deployment_id"]=="dpl_kMC7McYaaUaPVdmEXgW5TeUYxd2Q"
assert observed["project_id"]==canonical["project_id"]
assert observed["project_name"]==canonical["project_name"]
assert observed["environment"]=="preview"
assert observed["state"]=="READY"
assert observed["target"] is None
assert observed["source"]=="git"
assert observed["commit_sha"]=="77fe2a39a18fcb26887b9cee2cc9fd0df5a95da7"
assert observed["commit_ref"]=="m21-export-shape-fresh-main-20260920"
assert observed["url"]=="dpp-autopilot-95xeakbem-dimitar-lambovs-projects.vercel.app"
assert int(observed["ready_at_ms"])>=int(observed["created_at_ms"])

req=contract["deployment_requirements"]
assert req=={
    "environment":"preview",
    "state":"READY",
    "commit_match":"exact",
    "source_repo":"SoulFlameAdmin/DPPautopilot",
}

routes=contract["routes"]
assert [r["path"] for r in routes]==[
    "/",
    "/data/master-plan.json",
    "/demo/acceptance.html",
    "/api/models",
]
assert next(r for r in routes if r["path"]=="/api/models")["json_error_code"]=="AUTH_REQUIRED"
assert next(r for r in routes if r["path"]=="/data/master-plan.json")["headers"]["Cache-Control"]=="no-store, max-age=0"

required=set(contract["global_security_headers"])
assert required=={
    "Content-Security-Policy","Strict-Transport-Security","X-Content-Type-Options",
    "X-Frame-Options","Referrer-Policy","Permissions-Policy"
}

verifier=(ROOT/"scripts/verify_preview_evidence.py").read_text(encoding="utf-8")
for token in [
    "deployment project_id mismatch",
    "deployment environment is not preview",
    "deployment is not READY",
    "deployment commit does not match expected commit",
    "route evidence missing",
    "global security headers missing",
]:
    assert token in verifier, f"C02 verifier missing fail-closed check: {token}"

remaining=" ".join(contract["remaining"])
assert "C01 must be GREEN" in remaining
assert "Automated live HTTP/TLS/header smoke evidence" in remaining
assert "Vercel SSO" in remaining
assert "real READY preview" in contract["live_gap"]
assert "No create/redeploy action was attempted" in contract["live_gap"]

print("C02_PREVIEW_CONTRACT_PASS: exact READY preview identity is versioned; protected live route/TLS/header acceptance remains fail-closed")
