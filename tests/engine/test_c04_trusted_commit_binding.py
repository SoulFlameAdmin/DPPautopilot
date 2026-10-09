"""Synthetic C04 trusted-release attestation tests, not production approval."""
from __future__ import annotations

import copy
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tests/unit/test_migration_gate_evidence.py"
SPEC = importlib.util.spec_from_file_location("migration_fixture_for_binding", SOURCE)
assert SPEC and SPEC.loader
HELPERS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPERS)

VERIFY = HELPERS.VER
POLICY = HELPERS.POLICY


class C04TrustedCommitBindingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.valid = HELPERS.good()

    def fixture(self):
        return copy.deepcopy(self.valid)

    def test_expected_release_sha_allows_matching_evidence(self):
        evidence = self.fixture()
        VERIFY.verify(evidence, POLICY,
                      expected_commit_sha=evidence["candidate_commit_sha"])

    def test_rejects_internally_consistent_evidence_for_other_release(self):
        evidence = self.fixture()
        with self.assertRaisesRegex(VERIFY.MigrationGateDenied,
                                    "candidate commit does not match trusted release"):
            VERIFY.verify(evidence, POLICY, expected_commit_sha="0" * 40)

    def test_rejects_invalid_external_expected_sha(self):
        for supplied in ("short", "Q" * 40, "ABCDEF" * 6 + "ABCD"):
            with self.subTest(supplied=supplied):
                with self.assertRaisesRegex(VERIFY.MigrationGateDenied,
                                            "trusted expected commit"):
                    VERIFY.verify(self.fixture(), POLICY,
                                  expected_commit_sha=supplied)

    def test_rejects_unknown_schema_version_even_with_rehashed_manifest(self):
        for version in (0, 2, "1", True, None):
            with self.subTest(version=version):
                evidence = self.fixture()
                evidence["manifest"]["schema_version"] = version
                HELPERS.MigrationGateTests.rehash_manifest(evidence)
                with self.assertRaisesRegex(VERIFY.MigrationGateDenied,
                                            "unsupported migration manifest schema_version"):
                    VERIFY.verify(evidence, POLICY)

    def test_rejects_untyped_applied_migration_names(self):
        for invalid in (None, {}, 0, ""):
            with self.subTest(invalid=invalid):
                evidence = self.fixture()
                evidence["database"]["applied_migration_names"].append(invalid)
                with self.assertRaisesRegex(VERIFY.MigrationGateDenied,
                                            "applied migration names must be nonempty strings"):
                    VERIFY.verify(evidence, POLICY)

    def test_cli_denies_missing_trusted_release_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "evidence.json"
            path.write_text(json.dumps(self.fixture()), encoding="utf8")
            with patch.dict(os.environ, {"GITHUB_SHA": ""}):
                with patch.object(sys, "argv", ["verify", str(path)]):
                    with self.assertRaisesRegex(VERIFY.MigrationGateDenied,
                                                "trusted release commit required"):
                        VERIFY.main()

    def test_cli_denies_conflicting_ci_and_explicit_commits(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "evidence.json"
            path.write_text(json.dumps(self.fixture()), encoding="utf8")
            sha = self.valid["candidate_commit_sha"]
            with patch.dict(os.environ, {"GITHUB_SHA": "0" * 40}):
                with patch.object(sys, "argv",
                                  ["verify", str(path), "--expected-commit", sha]):
                    with self.assertRaisesRegex(VERIFY.MigrationGateDenied,
                                                "conflicts with trusted GITHUB_SHA"):
                        VERIFY.main()

    def test_cli_accepts_explicit_matching_release_sha(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "evidence.json"
            path.write_text(json.dumps(self.fixture()), encoding="utf8")
            sha = self.valid["candidate_commit_sha"]
            with patch.dict(os.environ, {"GITHUB_SHA": ""}):
                with patch.object(sys, "argv",
                                  ["verify", str(path), "--expected-commit", sha]):
                    with redirect_stdout(StringIO()):
                        self.assertEqual(VERIFY.main(), 0)


if __name__ == "__main__":
    unittest.main()
