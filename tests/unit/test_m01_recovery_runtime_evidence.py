import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "verify_m01_recovery_runtime_evidence",
    ROOT / "scripts" / "verify_m01_recovery_runtime_evidence.py",
)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def good():
    return {
        "version": 1,
        "task": "M01",
        "deployment": {
            "project_id": "prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr",
            "target": "production",
            "state": "READY",
            "commit_sha": "f5ac547b1be77905c1f23721d2d90ef6a862d403",
            "url": "https://dpp-autopilot.example.vercel.app",
        },
        "recovery_flow": {
            "requested_at": "2026-09-29T08:00:00Z",
            "opened_at": "2026-09-29T08:01:00Z",
            "password_updated_at": "2026-09-29T08:02:00Z",
            "redirect_origin": "https://dpp-autopilot.example.vercel.app",
            "recovery_session": "valid",
            "password_update": "success",
            "session_after_update": "consumed",
            "url_fragment_scrubbed": True,
            "token_persisted": False,
            "token_reuse_rejected": True,
        },
        "http_checks": {
            "recovery_page_status": 200,
            "auth_config_status": 200,
            "supabase_project": "frhletkiuupgksmgxoxc",
        },
    }


class M01RuntimeEvidenceTests(unittest.TestCase):
    def test_accepts_complete_runtime_evidence(self):
        self.assertEqual(MOD.verify(good())["decision"], "PASS")

    def test_rejects_non_production_deployment(self):
        doc = good()
        doc["deployment"]["target"] = "preview"
        with self.assertRaisesRegex(AssertionError, "production"):
            MOD.verify(doc)

    def test_rejects_unconsumed_session(self):
        doc = good()
        doc["recovery_flow"]["session_after_update"] = "valid"
        with self.assertRaisesRegex(AssertionError, "consumed"):
            MOD.verify(doc)

    def test_rejects_reusable_token(self):
        doc = good()
        doc["recovery_flow"]["token_reuse_rejected"] = False
        with self.assertRaisesRegex(AssertionError, "reusable"):
            MOD.verify(doc)

    def test_rejects_secret_material(self):
        doc = good()
        doc["runtime_debug"] = {"access_token": "must-not-be-recorded"}
        with self.assertRaisesRegex(AssertionError, "secret"):
            MOD.verify(doc)


if __name__ == "__main__":
    unittest.main()
