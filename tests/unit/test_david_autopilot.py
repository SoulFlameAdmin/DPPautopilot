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


MODEL_ID = "11111111-1111-4111-8111-111111111111"
ITEM_ID = "22222222-2222-4222-8222-222222222222"
IMPORT_ID = "33333333-3333-4333-8333-333333333333"


def api_snapshot_from_fixture() -> dict:
    return {
        "models": {
            "data": [
                {
                    "id": MODEL_ID,
                    "model_identifier": FIXTURE["model"]["identification"]["model_id"],
                    "manufacturer_name": FIXTURE["model"]["identification"]["manufacturer"]["name"],
                    "category": FIXTURE["model"]["identification"]["category"],
                    "canonical_data": copy.deepcopy(FIXTURE["model"]),
                }
            ]
        },
        "items": {
            "data": [
                {
                    "id": ITEM_ID,
                    "model_id": MODEL_ID,
                    "unique_identifier": FIXTURE["items"][0]["unique_identifier"],
                    "lifecycle_status": FIXTURE["items"][0]["lifecycle_status"],
                    "canonical_data": copy.deepcopy(FIXTURE["items"][0]),
                }
            ]
        },
        "import": {
            "data": {
                "import_id": IMPORT_ID,
                "status": "committed",
            }
        },
    }


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


    def test_authenticated_api_snapshot_builds_complete_plan(self):
        snapshot = api_snapshot_from_fixture()
        plan = MOD.build_plan_from_api_snapshot(CATALOG, snapshot, POLICY)

        self.assertEqual(plan["status"], "complete")
        self.assertEqual(plan["completeness"]["score"], 100.0)
        self.assertEqual(plan["input"]["kind"], "authenticated_api_snapshot")
        self.assertEqual(plan["input"]["modelId"], MODEL_ID)
        self.assertEqual(plan["input"]["itemId"], ITEM_ID)
        self.assertEqual(plan["input"]["importId"], IMPORT_ID)
        self.assertEqual(plan["input"]["importStatus"], "committed")

    def test_api_snapshot_maps_known_top_level_fields_without_overwriting_canonical_data(self):
        snapshot = api_snapshot_from_fixture()
        del snapshot["models"]["data"][0]["canonical_data"]["identification"]["manufacturer"]["name"]
        del snapshot["models"]["data"][0]["canonical_data"]["identification"]["model_id"]
        del snapshot["models"]["data"][0]["canonical_data"]["identification"]["category"]
        del snapshot["items"]["data"][0]["canonical_data"]["unique_identifier"]
        del snapshot["items"]["data"][0]["canonical_data"]["lifecycle_status"]

        fixture, _ = MOD.fixture_from_api_snapshot(snapshot)
        self.assertEqual(
            fixture["model"]["identification"]["manufacturer"]["name"],
            snapshot["models"]["data"][0]["manufacturer_name"],
        )
        self.assertEqual(
            fixture["model"]["identification"]["model_id"],
            snapshot["models"]["data"][0]["model_identifier"],
        )
        self.assertEqual(
            fixture["model"]["identification"]["category"],
            snapshot["models"]["data"][0]["category"],
        )
        self.assertEqual(
            fixture["items"][0]["unique_identifier"],
            snapshot["items"]["data"][0]["unique_identifier"],
        )
        self.assertEqual(
            fixture["items"][0]["lifecycle_status"],
            snapshot["items"]["data"][0]["lifecycle_status"],
        )

    def test_api_snapshot_rejects_cross_model_item_selection(self):
        snapshot = api_snapshot_from_fixture()
        snapshot["items"]["data"][0]["model_id"] = "44444444-4444-4444-8444-444444444444"
        with self.assertRaisesRegex(MOD.AutopilotPolicyError, "model_id"):
            MOD.build_plan_from_api_snapshot(CATALOG, snapshot, POLICY, model_id=MODEL_ID)

    def test_api_snapshot_rejects_credential_material(self):
        snapshot = api_snapshot_from_fixture()
        snapshot["authorization"] = "Bearer should-not-be-stored"
        with self.assertRaisesRegex(MOD.AutopilotPolicyError, "forbidden credential field"):
            MOD.build_plan_from_api_snapshot(CATALOG, snapshot, POLICY)

    def test_api_snapshot_selection_is_deterministic(self):
        snapshot = api_snapshot_from_fixture()
        second = copy.deepcopy(snapshot["items"]["data"][0])
        second["id"] = "55555555-5555-4555-8555-555555555555"
        second["unique_identifier"] = "urn:dpp:zzzz"
        snapshot["items"]["data"].insert(0, second)

        first_plan = MOD.build_plan_from_api_snapshot(CATALOG, snapshot, POLICY)
        second_plan = MOD.build_plan_from_api_snapshot(CATALOG, snapshot, POLICY)
        self.assertEqual(first_plan, second_plan)
        self.assertEqual(first_plan["input"]["itemId"], ITEM_ID)


if __name__ == "__main__":
    unittest.main()
