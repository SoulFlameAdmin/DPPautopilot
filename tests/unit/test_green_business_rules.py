#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from completeness import get_path, is_present, required_fields, score_fixture
from dpp_identifiers import is_demo_identifier, make_demo_identifier, parse_demo_identifier


class IdentifierBusinessRulesTests(unittest.TestCase):
    def test_deterministic_normalization_and_round_trip(self) -> None:
        model = "NSD-EV-82-DEMO"
        expected = "urn:dpp:demo:battery:NSD-EV-82-DEMO:000001"
        self.assertEqual(make_demo_identifier(model, 1), expected)
        self.assertEqual(make_demo_identifier(model, "000001"), expected)
        self.assertEqual(parse_demo_identifier(expected), (model, 1))
        self.assertTrue(is_demo_identifier(expected))

    def test_sequential_identifier_sample_has_no_collisions(self) -> None:
        ids = [make_demo_identifier("NSD-EV-82-DEMO", i) for i in range(1, 2001)]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(ids[-1].endswith(":002000"))

    def test_identifier_rejects_invalid_inputs(self) -> None:
        bad_inputs = [
            ("", 1),
            ("bad model", 1),
            ("/bad", 1),
            ("NSD-EV-82-DEMO", 0),
            ("NSD-EV-82-DEMO", -1),
            ("NSD-EV-82-DEMO", True),
            ("NSD-EV-82-DEMO", "abc"),
            ("NSD-EV-82-DEMO", 10**12),
        ]
        for model, serial in bad_inputs:
            with self.subTest(model=model, serial=serial):
                with self.assertRaises(ValueError):
                    make_demo_identifier(model, serial)

    def test_invalid_identifier_strings_are_rejected(self) -> None:
        for value in [
            "",
            "BAD-ID",
            "urn:dpp:prod:battery:X:000001",
            "urn:dpp:demo:battery:X:000000",
        ]:
            with self.subTest(value=value):
                self.assertFalse(is_demo_identifier(value))


class CompletenessBusinessRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
        cls.fixture = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))

    def test_complete_fixture_scores_100_percent(self) -> None:
        result = score_fixture(self.catalog, self.fixture)
        self.assertGreater(result["required"], 0)
        self.assertEqual(result["score"], 100.0)
        self.assertEqual(result["missingCount"], 0)
        self.assertEqual(result["present"], result["required"])

    def test_missing_required_field_reduces_score_and_preserves_traceability(self) -> None:
        broken = copy.deepcopy(self.fixture)
        del broken["model"]["identification"]["manufacturer"]["contact"]
        result = score_fixture(self.catalog, broken)
        self.assertLess(result["score"], 100.0)
        self.assertEqual(result["missingCount"], 1)
        missing = result["missing"][0]
        self.assertEqual(missing["path"], "model.identification.manufacturer.contact")
        self.assertEqual(missing["ui_target"], "modelForm.manufacturerContact")
        self.assertTrue("Annex" in missing["source"] or "Article" in missing["source"])

    def test_missing_item_is_handled_deterministically(self) -> None:
        without_items = copy.deepcopy(self.fixture)
        without_items["items"] = []
        result_a = score_fixture(self.catalog, without_items)
        result_b = score_fixture(self.catalog, without_items)
        self.assertEqual(result_a, result_b)
        self.assertGreaterEqual(result_a["missingCount"], 1)
        self.assertLess(result_a["score"], 100.0)

    def test_empty_required_field_set_scores_100(self) -> None:
        catalog = {"fields": [{"path": "model.optional", "required": False}]}
        result = score_fixture(catalog, {"model": {}, "items": []})
        self.assertEqual(result, {
            "required": 0,
            "present": 0,
            "missingCount": 0,
            "score": 100.0,
            "missing": [],
        })

    def test_presence_and_path_helpers_are_stable(self) -> None:
        self.assertEqual(get_path({"a": {"b": 3}}, "a.b"), 3)
        self.assertIsNone(get_path({"a": {}}, "a.b"))
        self.assertFalse(is_present(None))
        self.assertFalse(is_present("   "))
        self.assertTrue(is_present(""))
        self.assertTrue(is_present([]))
        self.assertTrue(is_present({}))
        self.assertEqual(
            required_fields({"fields": [{"path": "a", "required": True}, {"path": "b", "required": False}]}),
            [{"path": "a", "required": True}],
        )


if __name__ == "__main__":
    unittest.main()
