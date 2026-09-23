from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

AUTOPILOT_SPEC = importlib.util.spec_from_file_location(
    "david_autopilot",
    ROOT / "scripts/david_autopilot.py",
)
AUTOPILOT = importlib.util.module_from_spec(AUTOPILOT_SPEC)
assert AUTOPILOT_SPEC and AUTOPILOT_SPEC.loader
AUTOPILOT_SPEC.loader.exec_module(AUTOPILOT)

ADAPTER_SPEC = importlib.util.spec_from_file_location(
    "david_source_adapters_test_module",
    ROOT / "scripts/david_source_adapters.py",
)
ADAPTERS = importlib.util.module_from_spec(ADAPTER_SPEC)
assert ADAPTER_SPEC and ADAPTER_SPEC.loader
ADAPTER_SPEC.loader.exec_module(ADAPTERS)

CATALOG = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))
AUTOPILOT_POLICY = json.loads((ROOT / "data/david-autopilot-policy.json").read_text(encoding="utf-8"))
ADAPTER_POLICY = json.loads((ROOT / "data/david-source-adapter-policy.json").read_text(encoding="utf-8"))

HASH_A = "a" * 64


def source_snapshot(**overrides) -> dict:
    snapshot = {
        "snapshotVersion": "1.0.0",
        "erp": {
            "recordId": "erp-001",
            "fields": {},
        },
        "bms": {
            "recordId": "bms-001",
            "fields": {},
        },
        "plm": {
            "recordId": "plm-001",
            "fields": {},
        },
        "evidence": [],
    }
    snapshot.update(overrides)
    return snapshot


class DavidSourceAdapterTests(unittest.TestCase):
    def _plan_without(self, path: str) -> dict:
        fixture = copy.deepcopy(FIXTURE)
        if path.startswith("model."):
            parts = path.removeprefix("model.").split(".")
            node = fixture["model"]
        else:
            parts = path.removeprefix("item.").split(".")
            node = fixture["items"][0]
        for part in parts[:-1]:
            node = node[part]
        del node[parts[-1]]
        return AUTOPILOT.build_plan(CATALOG, fixture, AUTOPILOT_POLICY)

    def test_erp_candidate_for_safe_local_identification_gap(self):
        plan = self._plan_without("model.identification.place_of_manufacture")
        snapshot = source_snapshot()
        snapshot["erp"]["fields"]["model.identification.place_of_manufacture"] = "Sliven, Bulgaria"

        enriched = ADAPTERS.attach_source_candidates(plan, snapshot, ADAPTER_POLICY)
        candidate = enriched["sourceDiscovery"]["nextCandidate"]

        self.assertEqual(candidate["fieldPath"], "model.identification.place_of_manufacture")
        self.assertEqual(candidate["adapter"], "erp")
        self.assertEqual(candidate["value"], "Sliven, Bulgaria")
        self.assertFalse(candidate["approvalRequired"])
        self.assertEqual(candidate["state"], "ready_for_safe_local_automation")
        self.assertEqual(candidate["provenance"]["recordId"], "erp-001")
        self.assertNotIn("sourceDiscovery", plan)

    def test_bms_candidate_for_item_gap(self):
        plan = self._plan_without("item.state_of_health")
        snapshot = source_snapshot()
        snapshot["bms"]["fields"]["item.state_of_health"] = {
            "percent": 98.4,
            "measured_at": "2026-09-23T12:00:00Z",
        }

        discovery = ADAPTERS.discover_source_candidates(plan, snapshot, ADAPTER_POLICY)

        self.assertEqual(discovery["summary"]["candidateCount"], 1)
        self.assertEqual(discovery["nextCandidate"]["adapter"], "bms")
        self.assertFalse(discovery["nextCandidate"]["approvalRequired"])

    def test_plm_candidate_for_generic_model_gap(self):
        plan = self._plan_without("model.voltage")
        snapshot = source_snapshot()
        snapshot["plm"]["fields"]["model.voltage"] = {
            "minimum_v": 280,
            "nominal_v": 355,
            "maximum_v": 403,
        }

        discovery = ADAPTERS.discover_source_candidates(plan, snapshot, ADAPTER_POLICY)

        self.assertEqual(discovery["summary"]["candidateCount"], 1)
        self.assertEqual(discovery["nextCandidate"]["adapter"], "plm")
        self.assertEqual(discovery["summary"]["safeLocalCandidateCount"], 1)

    def test_evidence_candidate_is_always_approval_gated(self):
        plan = self._plan_without("model.carbon_footprint")
        snapshot = source_snapshot(
            evidence=[
                {
                    "documentId": "cf-report-001",
                    "sha256": HASH_A,
                    "claims": [
                        {
                            "fieldPath": "model.carbon_footprint",
                            "value": {
                                "total_kg_co2e_per_kwh": 51.2,
                                "study_reference": "CF-VERIFIED-001",
                            },
                            "confidence": 0.94,
                            "extractor": "local-parser-v1",
                        }
                    ],
                }
            ]
        )

        discovery = ADAPTERS.discover_source_candidates(plan, snapshot, ADAPTER_POLICY)
        candidate = discovery["nextCandidate"]

        self.assertEqual(candidate["adapter"], "evidence")
        self.assertTrue(candidate["approvalRequired"])
        self.assertEqual(candidate["state"], "approval_required")
        self.assertEqual(candidate["provenance"]["documentId"], "cf-report-001")
        self.assertEqual(candidate["provenance"]["sha256"], HASH_A)
        self.assertEqual(candidate["provenance"]["confidence"], 0.94)
        self.assertEqual(candidate["provenance"]["extractor"], "local-parser-v1")
        self.assertFalse(discovery["summary"]["writesAllowed"])
        self.assertFalse(discovery["summary"]["externalSideEffectsAllowed"])

    def test_invalid_evidence_hash_fails_closed(self):
        plan = self._plan_without("model.carbon_footprint")
        snapshot = source_snapshot(
            evidence=[
                {
                    "documentId": "cf-report-001",
                    "sha256": "not-a-sha256",
                    "claims": [
                        {
                            "fieldPath": "model.carbon_footprint",
                            "value": {"total_kg_co2e_per_kwh": 51.2},
                            "confidence": 0.9,
                        }
                    ],
                }
            ]
        )

        with self.assertRaisesRegex(ADAPTERS.SourceAdapterError, "valid SHA-256"):
            ADAPTERS.discover_source_candidates(plan, snapshot, ADAPTER_POLICY)

    def test_invalid_evidence_confidence_fails_closed(self):
        plan = self._plan_without("model.carbon_footprint")
        snapshot = source_snapshot(
            evidence=[
                {
                    "documentId": "cf-report-001",
                    "sha256": HASH_A,
                    "claims": [
                        {
                            "fieldPath": "model.carbon_footprint",
                            "value": {"total_kg_co2e_per_kwh": 51.2},
                            "confidence": 1.1,
                        }
                    ],
                }
            ]
        )

        with self.assertRaisesRegex(ADAPTERS.SourceAdapterError, "confidence must be 0..1"):
            ADAPTERS.discover_source_candidates(plan, snapshot, ADAPTER_POLICY)

    def test_credentials_are_rejected_recursively(self):
        plan = self._plan_without("model.voltage")
        snapshot = source_snapshot()
        snapshot["erp"]["authorization"] = "Bearer forbidden"

        with self.assertRaisesRegex(ADAPTERS.SourceAdapterError, "forbidden credential field"):
            ADAPTERS.discover_source_candidates(plan, snapshot, ADAPTER_POLICY)

    def test_adapter_order_is_deterministic_and_evidence_stays_gated(self):
        plan = self._plan_without("model.voltage")
        value = {"nominal_v": 355}
        snapshot = source_snapshot(
            evidence=[
                {
                    "documentId": "voltage-report-001",
                    "sha256": HASH_A,
                    "claims": [
                        {
                            "fieldPath": "model.voltage",
                            "value": value,
                            "confidence": 1.0,
                        }
                    ],
                }
            ]
        )
        snapshot["erp"]["fields"]["model.voltage"] = value
        snapshot["bms"]["fields"]["model.voltage"] = value
        snapshot["plm"]["fields"]["model.voltage"] = value

        first = ADAPTERS.discover_source_candidates(plan, snapshot, ADAPTER_POLICY)
        second = ADAPTERS.discover_source_candidates(plan, snapshot, ADAPTER_POLICY)

        self.assertEqual(first, second)
        self.assertEqual(
            [candidate["adapter"] for candidate in first["candidates"]],
            ["erp", "bms", "plm", "evidence"],
        )
        self.assertFalse(first["candidates"][0]["approvalRequired"])
        self.assertTrue(first["candidates"][-1]["approvalRequired"])

    def test_unresolved_action_is_reported_without_mutation(self):
        plan = self._plan_without("model.voltage")
        discovery = ADAPTERS.discover_source_candidates(
            plan,
            source_snapshot(),
            ADAPTER_POLICY,
        )

        self.assertEqual(discovery["summary"]["candidateCount"], 0)
        self.assertEqual(discovery["summary"]["unresolvedActionCount"], 1)
        self.assertIsNone(discovery["nextCandidate"])


if __name__ == "__main__":
    unittest.main()
