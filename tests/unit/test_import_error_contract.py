#!/usr/bin/env python3
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from import_error_contract import load_import_error_contract, map_import_sqlstate


class ImportErrorContractUnitTests(unittest.TestCase):
    def test_catalog_contains_exact_dp001_dp008_set(self) -> None:
        contract = load_import_error_contract()
        self.assertEqual(set(contract), {f"DP{i:03d}" for i in range(1, 9)})

    def test_semantic_mapping_is_stable(self) -> None:
        expected = {
            "DP001": ("import_not_found", 404),
            "DP002": ("import_has_no_rows", 422),
            "DP003": ("import_not_committable", 409),
            "DP004": ("import_row_has_validation_errors", 422),
            "DP005": ("import_row_missing_identity", 422),
            "DP006": ("import_commit_count_mismatch", 409),
            "DP007": ("import_committed_state_inconsistent", 409),
            "DP008": ("duplicate_battery_identifier", 409),
        }
        for sqlstate, (code, status) in expected.items():
            with self.subTest(sqlstate=sqlstate):
                mapped = map_import_sqlstate(sqlstate)
                self.assertEqual(mapped["sqlstate"], sqlstate)
                self.assertEqual(mapped["code"], code)
                self.assertEqual(mapped["http_status"], status)
                self.assertTrue(mapped["message"])

    def test_mapper_returns_fresh_dict(self) -> None:
        first = map_import_sqlstate("DP001")
        first["code"] = "mutated"
        second = map_import_sqlstate("DP001")
        self.assertEqual(second["code"], "import_not_found")

    def test_unknown_sqlstate_fails_safe(self) -> None:
        mapped = map_import_sqlstate("XX999")
        self.assertEqual(mapped, {
            "sqlstate": "XX999",
            "code": "internal_error",
            "message": "An unexpected error occurred.",
            "http_status": 500,
        })


if __name__ == "__main__":
    unittest.main()
