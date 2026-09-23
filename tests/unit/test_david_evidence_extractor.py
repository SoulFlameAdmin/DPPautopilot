from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


AUTOPILOT = load_module("david_autopilot_evidence_tests", "scripts/david_autopilot.py")
EXTRACTOR = load_module("david_evidence_extractor_test_module", "scripts/david_evidence_extractor.py")
ADAPTERS = load_module("david_source_adapters_evidence_tests", "scripts/david_source_adapters.py")

CATALOG = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))
AUTOPILOT_POLICY = json.loads((ROOT / "data/david-autopilot-policy.json").read_text(encoding="utf-8"))
EXTRACTION_POLICY = json.loads((ROOT / "data/david-evidence-extraction-policy.json").read_text(encoding="utf-8"))
ADAPTER_POLICY = json.loads((ROOT / "data/david-source-adapter-policy.json").read_text(encoding="utf-8"))

SHA_A = "a" * 64
SHA_B = "b" * 64


def raw_snapshot(text: str, *, document_id: str = "doc-001", sha256: str = SHA_A) -> dict:
    return {
        "snapshotVersion": "1.0.0",
        "documents": [
            {
                "documentId": document_id,
                "sha256": sha256,
                "mediaType": "text/plain",
                "text": text,
            }
        ],
    }


class DavidEvidenceExtractionTests(unittest.TestCase):
    def test_extracts_carbon_footprint_with_provenance_and_confidence(self):
        snapshot = raw_snapshot(
            "Verified report. Carbon footprint: 51.2 kg CO2e/kWh. "
            "Study reference: CF-VERIFIED-001. End."
        )

        result = EXTRACTOR.extract_evidence(snapshot, EXTRACTION_POLICY)
        claims = result["evidence"][0]["claims"]
        carbon = next(claim for claim in claims if claim["fieldPath"] == "model.carbon_footprint")

        self.assertEqual(
            carbon["value"],
            {
                "total_kg_co2e_per_kwh": 51.2,
                "study_reference": "CF-VERIFIED-001.",
            },
        )
        self.assertEqual(carbon["confidence"], 0.95)
        self.assertEqual(carbon["extractor"], "carbon_footprint_v1")
        self.assertTrue(carbon["approvalRequired"])
        self.assertEqual(carbon["state"], "approval_required")
        self.assertFalse(carbon["autoAccepted"])
        self.assertEqual(carbon["provenance"]["documentId"], "doc-001")
        self.assertEqual(carbon["provenance"]["sha256"], SHA_A)
        self.assertLessEqual(len(carbon["evidenceSpan"]["excerpt"]), 240)
        self.assertEqual(result["summary"]["autoAcceptedClaimCount"], 0)

    def test_extracts_eu_declaration_reference(self):
        snapshot = raw_snapshot(
            "EU Declaration of Conformity reference: EU-DOC-2026-001\n"
            "Other unrelated text."
        )

        result = EXTRACTOR.extract_evidence(snapshot, EXTRACTION_POLICY)
        claim = next(
            claim
            for claim in result["evidence"][0]["claims"]
            if claim["fieldPath"] == "model.eu_declaration_of_conformity"
        )

        self.assertEqual(claim["value"], "EU-DOC-2026-001")
        self.assertEqual(claim["confidence"], 0.97)
        self.assertTrue(claim["approvalRequired"])

    def test_no_match_yields_no_claim_and_never_guesses(self):
        result = EXTRACTOR.extract_evidence(
            raw_snapshot("This document contains no configured DPP evidence labels."),
            EXTRACTION_POLICY,
        )

        self.assertEqual(result["summary"]["claimCount"], 0)
        self.assertEqual(result["evidence"][0]["claims"], [])

    def test_invalid_sha256_fails_closed(self):
        with self.assertRaisesRegex(EXTRACTOR.EvidenceExtractionError, "valid SHA-256"):
            EXTRACTOR.extract_evidence(
                raw_snapshot("Carbon footprint: 50 kg CO2e/kWh", sha256="bad"),
                EXTRACTION_POLICY,
            )

    def test_credentials_are_rejected_recursively(self):
        snapshot = raw_snapshot("Carbon footprint: 50 kg CO2e/kWh")
        snapshot["documents"][0]["metadata"] = {"authorization": "Bearer forbidden"}

        with self.assertRaisesRegex(EXTRACTOR.EvidenceExtractionError, "forbidden credential field"):
            EXTRACTOR.extract_evidence(snapshot, EXTRACTION_POLICY)

    def test_duplicate_document_ids_fail_closed(self):
        snapshot = raw_snapshot("Carbon footprint: 50 kg CO2e/kWh")
        snapshot["documents"].append(
            {
                "documentId": "doc-001",
                "sha256": SHA_B,
                "mediaType": "text/plain",
                "text": "EU Declaration of Conformity: EU-DOC-2",
            }
        )

        with self.assertRaisesRegex(EXTRACTOR.EvidenceExtractionError, "duplicate documentId"):
            EXTRACTOR.extract_evidence(snapshot, EXTRACTION_POLICY)

    def test_policy_cannot_enable_auto_accept(self):
        unsafe = copy.deepcopy(EXTRACTION_POLICY)
        unsafe["safety"]["allowAutoAccept"] = True

        with self.assertRaisesRegex(EXTRACTOR.EvidenceExtractionError, "must not auto-accept"):
            EXTRACTOR.extract_evidence(
                raw_snapshot("Carbon footprint: 50 kg CO2e/kWh"),
                unsafe,
            )

    def test_extraction_is_deterministic(self):
        snapshot = {
            "snapshotVersion": "1.0.0",
            "documents": [
                {
                    "documentId": "z-doc",
                    "sha256": SHA_B,
                    "mediaType": "text/plain",
                    "text": "EU Declaration of Conformity: EU-DOC-Z",
                },
                {
                    "documentId": "a-doc",
                    "sha256": SHA_A,
                    "mediaType": "text/plain",
                    "text": "Carbon footprint: 49.5 kg CO2e/kWh\nStudy reference: CF-A",
                },
            ],
        }

        first = EXTRACTOR.extract_evidence(snapshot, EXTRACTION_POLICY)
        second = EXTRACTOR.extract_evidence(snapshot, EXTRACTION_POLICY)

        self.assertEqual(first, second)
        self.assertEqual(
            [document["documentId"] for document in first["evidence"]],
            ["a-doc", "z-doc"],
        )

    def test_merge_rejects_snapshot_version_mismatch(self):
        extraction = EXTRACTOR.extract_evidence(
            raw_snapshot("Carbon footprint: 50 kg CO2e/kWh"),
            EXTRACTION_POLICY,
        )
        source = {
            "snapshotVersion": "2.0.0",
            "erp": {"recordId": "erp-1", "fields": {}},
        }

        with self.assertRaisesRegex(EXTRACTOR.EvidenceExtractionError, "snapshotVersion mismatch"):
            EXTRACTOR.merge_with_source_snapshot(source, extraction)

    def test_extracted_carbon_flows_into_existing_evidence_adapter_as_approval_required(self):
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["carbon_footprint"]
        plan = AUTOPILOT.build_plan(CATALOG, fixture, AUTOPILOT_POLICY)

        extraction = EXTRACTOR.extract_evidence(
            raw_snapshot(
                "Carbon footprint: 48.7 kg CO2e/kWh\n"
                "Study reference: CF-LAB-2026-007"
            ),
            EXTRACTION_POLICY,
        )
        source_snapshot = EXTRACTOR.to_source_snapshot(extraction)
        discovery = ADAPTERS.discover_source_candidates(
            plan,
            source_snapshot,
            ADAPTER_POLICY,
        )

        candidate = discovery["nextCandidate"]
        self.assertEqual(candidate["fieldPath"], "model.carbon_footprint")
        self.assertEqual(candidate["adapter"], "evidence")
        self.assertEqual(candidate["value"]["total_kg_co2e_per_kwh"], 48.7)
        self.assertEqual(candidate["provenance"]["documentId"], "doc-001")
        self.assertEqual(candidate["provenance"]["confidence"], 0.95)
        self.assertTrue(candidate["approvalRequired"])
        self.assertEqual(candidate["state"], "approval_required")
        self.assertFalse(discovery["summary"]["writesAllowed"])


if __name__ == "__main__":
    unittest.main()
