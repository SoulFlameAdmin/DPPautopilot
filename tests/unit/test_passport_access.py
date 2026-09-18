#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from passport_access import load_catalog, load_policy, project_public_passport, validate_access_catalog


class PassportAccessPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.policy = load_policy()
        cls.fixture = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))

    def test_all_42_fields_have_allowed_access_class(self) -> None:
        self.assertEqual(len(self.catalog["fields"]), 42)
        counts = validate_access_catalog(self.catalog, self.policy)
        self.assertEqual(counts["public"], 29)
        self.assertEqual(counts["public_identifier"], 1)
        self.assertEqual(counts["legitimate_interest"], 11)
        self.assertEqual(counts["authority_only"], 1)
        self.assertEqual(sum(counts.values()), 42)

    def test_public_and_restricted_classes_are_disjoint(self) -> None:
        public = set(self.policy["public_projection_classes"])
        restricted = set(self.policy["restricted_projection_classes"])
        self.assertFalse(public & restricted)
        self.assertEqual(public | restricted, set(self.policy["allowed_classes"]))

    def test_public_projection_contains_only_public_classes(self) -> None:
        projection = project_public_passport(self.fixture, catalog=self.catalog, policy=self.policy)
        allowed = set(self.policy["public_projection_classes"])
        self.assertGreater(projection["field_count"], 0)
        self.assertTrue(all(field["access"] in allowed for field in projection["fields"]))
        self.assertIn("item.unique_identifier", {field["path"] for field in projection["fields"]})

    def test_restricted_sample_values_do_not_leak(self) -> None:
        projection = project_public_passport(self.fixture, catalog=self.catalog, policy=self.policy)
        serialized = json.dumps(projection, sort_keys=True, ensure_ascii=False)
        restricted_values = [
            self.fixture["model"]["restricted_composition"]["cathode"],
            self.fixture["model"]["safety_measures"]["transport"],
            self.fixture["model"]["compliance_test_reports"][0]["document_ref"],
            self.fixture["items"][0]["state_of_health"],
        ]
        for value in restricted_values:
            with self.subTest(value=value):
                self.assertNotIn(str(value), serialized)

    def test_invalid_item_index_is_rejected(self) -> None:
        with self.assertRaises(IndexError):
            project_public_passport(self.fixture, item_index=999, catalog=self.catalog, policy=self.policy)


if __name__ == "__main__":
    unittest.main()
