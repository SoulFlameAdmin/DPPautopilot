#!/usr/bin/env python3
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from eu_conformance import (
    ConformanceError,
    access_allowed,
    assert_not_demo_uid,
    evaluate_final_gate,
    load_json,
    resolve_exact_passport,
    run_repository_gate,
    validate_71_matrix,
    validate_harmonised_standards_inventory,
    validate_lifecycle_transition,
    validate_model_item_separation,
    validate_uid_bindings,
    transition_registry_state,
)


class EuDppConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.matrix = load_json("data/lmt-battery-71-eu-conformance-v1.json")
        cls.standards = load_json("data/eu-dpp-harmonised-standards-v1.json")

    def test_71_point_matrix_is_complete_and_traceable(self) -> None:
        result = validate_71_matrix(self.matrix)
        self.assertEqual(result["total"], 71)
        self.assertGreater(result["launchEffective"], 0)
        self.assertGreater(result["provenanceRequired"], 0)
        self.assertEqual(result["status"], "MATRIX_VALIDATED_NOT_EU_CERTIFIED")

    def test_matrix_rejects_unverified_pass_claim(self) -> None:
        broken = copy.deepcopy(self.matrix)
        broken["points"][0]["conformanceStatus"] = "PASS"
        broken["points"][0]["verificationState"] = "REQUIRED_UNVERIFIED"
        with self.assertRaises(ConformanceError):
            validate_71_matrix(broken)

    def test_uid_is_unique_and_immutable(self) -> None:
        result = validate_uid_bindings([
            {"item_id": "BAT-001", "unique_identifier": "UID-001"},
            {"item_id": "BAT-001", "unique_identifier": "UID-001"},
            {"item_id": "BAT-002", "unique_identifier": "UID-002"},
        ])
        self.assertEqual(result["uniqueUids"], 2)

        with self.assertRaises(ConformanceError):
            validate_uid_bindings([
                {"item_id": "BAT-001", "unique_identifier": "UID-001"},
                {"item_id": "BAT-001", "unique_identifier": "UID-CHANGED"},
            ])

        with self.assertRaises(ConformanceError):
            validate_uid_bindings([
                {"item_id": "BAT-001", "unique_identifier": "UID-001"},
                {"item_id": "BAT-002", "unique_identifier": "UID-001"},
            ])

    def test_qr_resolver_must_return_exact_uid_passport(self) -> None:
        passports = {
            "UID-001": {"unique_identifier": "UID-001", "model": "LMT-A"},
            "UID-002": {"unique_identifier": "UID-002", "model": "LMT-A"},
        }
        self.assertEqual(resolve_exact_passport("UID-001", passports)["unique_identifier"], "UID-001")

        poisoned = {"UID-001": {"unique_identifier": "UID-002"}}
        with self.assertRaises(ConformanceError):
            resolve_exact_passport("UID-001", poisoned)

    def test_access_policy_is_fail_closed(self) -> None:
        self.assertTrue(access_allowed("public", "anonymous"))
        self.assertTrue(access_allowed("legitimate_interest", "responsible_operator"))
        self.assertTrue(access_allowed("authority_only", "authority"))
        self.assertFalse(access_allowed("legitimate_interest", "anonymous"))
        self.assertFalse(access_allowed("authority_only", "responsible_operator"))
        with self.assertRaises(ConformanceError):
            access_allowed("unknown", "anonymous")

    def test_lifecycle_requires_valid_transition_and_predecessor_link(self) -> None:
        ok = validate_lifecycle_transition(
            "ORIGINAL",
            "REPURPOSED",
            predecessor_passport_uid="UID-ORIGINAL",
        )
        self.assertEqual(ok["status"], "TRANSITION_VALID")

        with self.assertRaises(ConformanceError):
            validate_lifecycle_transition("ORIGINAL", "REPURPOSED")

        with self.assertRaises(ConformanceError):
            validate_lifecycle_transition("RECYCLED", "ORIGINAL")


    def test_demo_uid_is_forbidden_in_production_gate(self) -> None:
        self.assertEqual(assert_not_demo_uid("01:1234567890123:BAT-0001"), "01:1234567890123:BAT-0001")
        with self.assertRaises(ConformanceError):
            assert_not_demo_uid("urn:dpp:demo:battery:LMT-A:000001")

    def test_model_and_individual_battery_payloads_cannot_cross_contaminate(self) -> None:
        result = validate_model_item_separation(
            {"identification": {"model_id": "LMT-A"}, "voltage": {"nominal_v": 48}},
            {"unique_identifier": "UID-001", "state_of_health": {"pct": 100}},
        )
        self.assertEqual(result["status"], "MODEL_ITEM_SEPARATION_VALID")

        with self.assertRaises(ConformanceError):
            validate_model_item_separation(
                {"identification": {}, "unique_identifier": "UID-001"},
                {"unique_identifier": "UID-001"},
            )

        with self.assertRaises(ConformanceError):
            validate_model_item_separation(
                {"identification": {}},
                {"unique_identifier": "UID-001", "voltage": {"nominal_v": 48}},
            )

    def test_registry_state_machine_requires_external_proof(self) -> None:
        submitted = transition_registry_state(
            "not_registered",
            "submitted",
            submission_evidence="submission-2026-001",
        )
        self.assertEqual(submitted["to"], "submitted")

        registered = transition_registry_state(
            "submitted",
            "registered",
            registry_receipt="registry-receipt-001",
        )
        self.assertEqual(registered["status"], "REGISTRY_TRANSITION_VALID")

        with self.assertRaises(ConformanceError):
            transition_registry_state("not_registered", "submitted")

        with self.assertRaises(ConformanceError):
            transition_registry_state("submitted", "registered")

        with self.assertRaises(ConformanceError):
            transition_registry_state("registered", "not_registered")

    def test_en_references_cannot_self_pass_without_clause_review(self) -> None:
        result = validate_harmonised_standards_inventory(self.standards)
        self.assertEqual(result["count"], 6)

        broken = copy.deepcopy(self.standards)
        broken["standards"][0]["conformanceStatus"] = "PASS"
        with self.assertRaises(ConformanceError):
            validate_harmonised_standards_inventory(broken)

    def test_final_gate_cannot_jump_to_eu_complete(self) -> None:
        self.assertEqual(evaluate_final_gate({}), "NOT_READY")
        self.assertEqual(
            evaluate_final_gate({"technical_tests_passed": True}),
            "TECHNICALLY_READY",
        )
        pilot = {
            "technical_tests_passed": True,
            "real_manufacturer_dataset": True,
            "physical_qr_scan": True,
            "customer_uat": True,
        }
        self.assertEqual(evaluate_final_gate(pilot), "PILOT_EVIDENCE_COMPLETE")

        eu = {
            **pilot,
            "all_applicable_points_evidenced": True,
            "licensed_en_clause_review_complete": True,
            "registry_proof": True,
            "legal_compliance_review": True,
            "provenance_complete": True,
        }
        self.assertEqual(evaluate_final_gate(eu), "EU_CONFORMANCE_EVIDENCE_COMPLETE")

    def test_repository_gate_is_non_certification_gate(self) -> None:
        result = run_repository_gate()
        self.assertEqual(
            result["claim"],
            "TECHNICAL_TRACEABILITY_GATE_ONLY_NOT_EU_CERTIFICATION",
        )


if __name__ == "__main__":
    unittest.main()
