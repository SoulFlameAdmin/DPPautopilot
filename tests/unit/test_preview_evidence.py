from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location("preview_verify",ROOT/"scripts/verify_preview_evidence.py")
MOD=importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MOD)
CONTRACT=json.loads((ROOT/"data/preview-verification-contract.json").read_text(encoding="utf-8"))

SECURITY={
    "Content-Security-Policy":"default-src 'self'",
    "Strict-Transport-Security":"max-age=31536000",
    "X-Content-Type-Options":"nosniff",
    "X-Frame-Options":"DENY",
    "Referrer-Policy":"no-referrer",
    "Permissions-Policy":"camera=()",
}

def good():
    sha="abcdef1234567890"
    return {
        "expected_commit_sha":sha,
        "deployment":{
            "project_id":"prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr",
            "environment":"preview",
            "state":"READY",
            "commit_sha":sha,
            "url":"https://example-preview.vercel.app",
        },
        "routes":[
            {"path":"/","status":200,"headers":dict(SECURITY),"body":"DPP Autopilot"},
            {"path":"/data/master-plan.json","status":200,"headers":{"Cache-Control":"no-store, max-age=0"},"body":"{}"},
            {"path":"/demo/acceptance.html","status":200,"headers":{},"body":"Acceptance"},
            {"path":"/api/models","status":401,"headers":dict(SECURITY,**{"X-Request-ID":"req-12345678"}),"json":{"error":{"code":"AUTH_REQUIRED"}}},
        ],
    }

class PreviewEvidenceTests(unittest.TestCase):
    def test_accepts_exact_preview_evidence(self):
        MOD.validate_evidence(good(),CONTRACT)

    def test_rejects_wrong_project(self):
        e=good();e["deployment"]["project_id"]="prj_wrong"
        with self.assertRaisesRegex(MOD.PreviewEvidenceError,"project_id mismatch"):
            MOD.validate_evidence(e,CONTRACT)

    def test_rejects_wrong_commit(self):
        e=good();e["deployment"]["commit_sha"]="deadbeef"
        with self.assertRaisesRegex(MOD.PreviewEvidenceError,"commit does not match"):
            MOD.validate_evidence(e,CONTRACT)

    def test_rejects_non_ready_or_non_preview(self):
        e=good();e["deployment"]["state"]="BUILDING"
        with self.assertRaisesRegex(MOD.PreviewEvidenceError,"not READY"):
            MOD.validate_evidence(e,CONTRACT)
        e=good();e["deployment"]["environment"]="production"
        with self.assertRaisesRegex(MOD.PreviewEvidenceError,"not preview"):
            MOD.validate_evidence(e,CONTRACT)

    def test_rejects_missing_route_or_security_header(self):
        e=good();e["routes"]=[r for r in e["routes"] if r["path"]!="/demo/acceptance.html"]
        with self.assertRaisesRegex(MOD.PreviewEvidenceError,"route evidence missing"):
            MOD.validate_evidence(e,CONTRACT)
        e=good();del e["routes"][0]["headers"]["X-Frame-Options"]
        with self.assertRaisesRegex(MOD.PreviewEvidenceError,"global security headers missing"):
            MOD.validate_evidence(e,CONTRACT)

if __name__=="__main__":
    unittest.main()
