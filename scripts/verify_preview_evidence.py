#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
CONTRACT_PATH=ROOT/"data/preview-verification-contract.json"

class PreviewEvidenceError(AssertionError):
    pass

def _lower_headers(headers: dict[str,Any]) -> dict[str,str]:
    return {str(k).lower():str(v) for k,v in (headers or {}).items()}

def validate_evidence(evidence: dict[str,Any],contract: dict[str,Any]) -> None:
    deployment=evidence.get("deployment")
    if not isinstance(deployment,dict):
        raise PreviewEvidenceError("deployment evidence missing")
    for field in contract["evidence_schema"]["deployment_required_fields"]:
        if not deployment.get(field):
            raise PreviewEvidenceError(f"deployment field missing: {field}")

    canonical=contract["canonical_vercel"]
    req=contract["deployment_requirements"]
    if deployment["project_id"]!=canonical["project_id"]:
        raise PreviewEvidenceError("deployment project_id mismatch")
    if deployment["environment"]!=req["environment"]:
        raise PreviewEvidenceError("deployment environment is not preview")
    if deployment["state"]!=req["state"]:
        raise PreviewEvidenceError("deployment is not READY")

    expected_commit=evidence.get("expected_commit_sha")
    if not expected_commit:
        raise PreviewEvidenceError("expected_commit_sha missing")
    if deployment["commit_sha"]!=expected_commit:
        raise PreviewEvidenceError("deployment commit does not match expected commit")

    rows=evidence.get("routes")
    if not isinstance(rows,list):
        raise PreviewEvidenceError("routes evidence missing")
    by_path={r.get("path"):r for r in rows if isinstance(r,dict)}

    for expected in contract["routes"]:
        path=expected["path"]
        row=by_path.get(path)
        if not row:
            raise PreviewEvidenceError(f"route evidence missing: {path}")
        if row.get("status")!=expected["status"]:
            raise PreviewEvidenceError(f"unexpected status for {path}: {row.get('status')}")
        headers=_lower_headers(row.get("headers") or {})
        for name in expected.get("required_headers",[]):
            if name.lower() not in headers:
                raise PreviewEvidenceError(f"required header missing for {path}: {name}")
        for name,value in (expected.get("headers") or {}).items():
            if headers.get(name.lower())!=value:
                raise PreviewEvidenceError(f"header mismatch for {path}: {name}")
        contains=expected.get("body_contains")
        if contains and contains.lower() not in str(row.get("body","")).lower():
            raise PreviewEvidenceError(f"body marker missing for {path}")
        error_code=expected.get("json_error_code")
        if error_code:
            body_json=row.get("json")
            actual=((body_json or {}).get("error") or {}).get("code") if isinstance(body_json,dict) else None
            if actual!=error_code:
                raise PreviewEvidenceError(f"error code mismatch for {path}: {actual}")

    global_required=[h.lower() for h in contract["global_security_headers"]]
    for path,row in by_path.items():
        if path.startswith("/api/") or path=="/":
            headers=_lower_headers(row.get("headers") or {})
            missing=[h for h in global_required if h not in headers]
            if missing:
                raise PreviewEvidenceError(f"global security headers missing for {path}: {','.join(missing)}")

def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("evidence",type=Path)
    args=ap.parse_args()
    contract=json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    evidence=json.loads(args.evidence.read_text(encoding="utf-8"))
    validate_evidence(evidence,contract)
    print("C02_PREVIEW_EVIDENCE_PASS: preview deployment identity, exact commit, routes and security headers match contract")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
