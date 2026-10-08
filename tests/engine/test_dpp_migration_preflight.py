import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[2] / "tools/engine/dpp_migration_preflight.py"
SPEC = importlib.util.spec_from_file_location("dpp_migration_preflight", MODULE)
PREFLIGHT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREFLIGHT)
PROJECT = "frhletkiuupgksmgxoxc"

def fixture(root, rows, applied):
    folder = root / "supabase/migrations"
    folder.mkdir(parents=True)
    for version, name in rows:
        (folder / f"{version}_{name}.sql").write_text("-- fixture", encoding="utf-8")
    return {
        "project_id": PROJECT,
        "source": "Supabase list_migrations read-only connector",
        "applied_migrations": [{"version": v, "name": n} for v,n in applied]
    }

class C04PreflightTests(unittest.TestCase):
    def test_pending_is_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            base = ("20261007000000", "applied")
            pending = ("20261008000000", "pending")
            report = PREFLIGHT.report(root,fixture(root,[base,pending],[base]),PROJECT)
            self.assertEqual(report["pending_count"], 1)
            self.assertEqual(report["status"], "BLOCKED")
            self.assertFalse(report["c04_release_gate_passed"])

    def test_all_applied_still_not_release_pass(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            base = ("20261007000000", "applied")
            report = PREFLIGHT.report(root,fixture(root,[base],[base]),PROJECT)
            self.assertTrue(report["snapshot_name_coverage"])
            self.assertEqual(report["status"], "PREFLIGHT_ONLY")
            self.assertFalse(report["c04_release_gate_passed"])

    def test_wrong_project_denied(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            base = ("20261007000000", "applied")
            snapshot = fixture(root,[base],[base])
            with self.assertRaises(ValueError):
                PREFLIGHT.report(root,snapshot,"some_other_project")

    def test_unverified_snapshot_denied(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            base = ("20261007000000", "applied")
            snapshot = fixture(root,[base],[base])
            snapshot["source"] = "asserted_without_proof"
            with self.assertRaises(ValueError):
                PREFLIGHT.report(root,snapshot,PROJECT)

    def test_same_name_different_version_denied(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snapshot = fixture(root,[("20261008000000","acme")],[("20261007000000","acme")])
            report = PREFLIGHT.report(root,snapshot,PROJECT)
            self.assertEqual(len(report["name_version_conflicts"]),1)
            self.assertEqual(report["status"],"BLOCKED")

    def test_same_version_different_name_denied(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snapshot = fixture(root,[("20261007000000","acme")],[("20261007000000","elsewhere")])
            report = PREFLIGHT.report(root,snapshot,PROJECT)
            self.assertEqual(len(report["version_name_conflicts"]),1)

    def test_duplicate_snapshot_versions_denied(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            row = ("20261007000000","acme")
            snapshot = fixture(root,[row],[row,row])
            with self.assertRaises(ValueError):
                PREFLIGHT.report(root,snapshot,PROJECT)

    def test_duplicate_repo_versions_denied(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            rows = [("20261007000000","acme"),("20261007000000","other")]
            snapshot = fixture(root,rows,[rows[0]])
            with self.assertRaises(ValueError):
                PREFLIGHT.report(root,snapshot,PROJECT)
