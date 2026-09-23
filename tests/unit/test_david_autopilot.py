from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("david_autopilot", ROOT / "scripts/david_autopilot.py")
MOD = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MOD)

CATALOG = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))
POLICY = json.loads((ROOT / "data/david-autopilot-policy.json").read_text(encoding="utf-8"))


class DavidAutopilotTests(unittest.TestCase):
    def test_complete_fixture_needs_no_action(self):
        plan = MOD.build_plan(CATALOG, FIXTURE, POLICY)
        self.assertEqual(plan["status"], "complete")
        self.assertEqual(plan["completeness"]["score"], 100.0)
        self.assertEqual(plan["summary"]["actionCount"], 0)
        self.assertIsNone(plan["nextAction"])

    def test_missing_supplier_master_data_is_approval_gated(self):
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["identification"]["manufacturer"]["contact"]
        plan = MOD.build_plan(CATALOG, fixture, POLICY)
        action = plan["nextAction"]

        self.assertEqual(action["fieldPath"], "model.identification.manufacturer.contact")
        self.assertEqual(action["action"], "request_supplier_master_data")
        self.assertEqual(action["source"], "supplier_master_data")
        self.assertTrue(action["approvalRequired"])
        self.assertEqual(action["executionMode"], "propose")
        self.assertEqual(action["state"], "approval_required")
        self.assertTrue(action["evidence"]["regulatorySource"])
        self.assertTrue(action["evidence"]["requirementIds"])

    def test_internal_identification_gap_can_be_safe_local_automation(self):
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["identification"]["place_of_manufacture"]
        plan = MOD.build_plan(CATALOG, fixture, POLICY)
        action = plan["nextAction"]

        self.assertEqual(action["action"], "inspect_internal_master_data")
        self.assertEqual(action["executionMode"], "auto_local")
        self.assertFalse(action["approvalRequired"])
        self.assertEqual(action["state"], "ready_for_safe_local_automation")

    def test_evidence_sensitive_gap_is_never_auto_claimed(self):
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["carbon_footprint"]
        plan = MOD.build_plan(CATALOG, fixture, POLICY)
        action = plan["nextAction"]

        self.assertEqual(action["action"], "request_or_extract_verified_evidence")
        self.assertTrue(action["approvalRequired"])
        self.assertEqual(action["state"], "approval_required")
        self.assertFalse(plan["summary"]["externalSideEffectsAllowed"])

    def test_plan_is_deterministic(self):
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["identification"]["place_of_manufacture"]
        del fixture["model"]["carbon_footprint"]
        first = MOD.build_plan(CATALOG, fixture, POLICY)
        second = MOD.build_plan(CATALOG, fixture, POLICY)
        self.assertEqual(first, second)
        self.assertEqual(first["actions"][0]["fieldPath"], "model.identification.place_of_manufacture")
        self.assertEqual(first["summary"]["actionCount"], 2)

    def test_policy_rejects_external_side_effect_mode(self):
        unsafe = copy.deepcopy(POLICY)
        unsafe["safety"]["allowExternalSideEffects"] = True
        with self.assertRaisesRegex(MOD.AutopilotPolicyError, "external side effects"):
            MOD.build_plan(CATALOG, FIXTURE, unsafe)


if __name__ == "__main__":
    unittest.main()
