"""Run the actual C04 manifest security unit suite independently of blocked Main CI.

The tests are synthetic release-evidence fixtures, not proof that live Supabase
has applied pending migrations. Never treat PASS here as C04 production GREEN.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "tests/unit/test_migration_gate_evidence.py"
SPEC = importlib.util.spec_from_file_location("dpp_c04_release_unit", TARGET)
assert SPEC and SPEC.loader and TARGET.is_file()
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

# unittest discovery imports this class; keep one source of truth for test cases.
MigrationGateTests = MODULE.MigrationGateTests

import unittest

class C04FilenameShapeAcceptance(unittest.TestCase):
    def test_actual_14_digit_filename_in_repo_is_accepted(self):
        e = MODULE.good()
        names = {row["filename"] for row in e["manifest"]["migrations"]}
        self.assertIn("20261008024500_dpp_organization_ensure.sql", names)
        MODULE.VER.verify(e, MODULE.POLICY)

    def test_13_digit_filename_is_rejected_even_if_envelope_is_rehashed(self):
        e = MODULE.good()
        row = next(row for row in e["manifest"]["migrations"]
                   if row["name"] == "dpp_organization_ensure")
        row["filename"] = "2026100802450_dpp_organization_ensure.sql"
        MODULE.MigrationGateTests.rehash_manifest(e)
        with self.assertRaisesRegex(MODULE.VER.MigrationGateDenied,
                                    "missing source migration file"):
            MODULE.VER.verify(e, MODULE.POLICY)
