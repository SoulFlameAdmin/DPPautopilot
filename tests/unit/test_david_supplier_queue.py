from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

AUTOPILOT_SPEC = importlib.util.spec_from_file_location(
    "david_autopilot_supplier_tests",
    ROOT / "scripts/david_autopilot.py",
)
AUTOPILOT = importlib.util.module_from_spec(AUTOPILOT_SPEC)
assert AUTOPILOT_SPEC and AUTOPILOT_SPEC.loader
AUTOPILOT_SPEC.loader.exec_module(AUTOPILOT)

QUEUE_SPEC = importlib.util.spec_from_file_location(
    "david_supplier_queue_test_module",
    ROOT / "scripts/david_supplier_queue.py",
)
QUEUE = importlib.util.module_from_spec(QUEUE_SPEC)
assert QUEUE_SPEC and QUEUE_SPEC.loader
QUEUE_SPEC.loader.exec_module(QUEUE)

CATALOG = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))
AUTOPILOT_POLICY = json.loads((ROOT / "data/david-autopilot-policy.json").read_text(encoding="utf-8"))
QUEUE_POLICY = json.loads((ROOT / "data/david-supplier-queue-policy.json").read_text(encoding="utf-8"))


class DavidSupplierQueueTests(unittest.TestCase):
    def _supplier_plan(self) -> dict:
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["identification"]["manufacturer"]["contact"]
        return AUTOPILOT.build_plan(CATALOG, fixture, AUTOPILOT_POLICY)

    def test_supplier_gap_creates_draft_request(self):
        queue = QUEUE.build_supplier_queue(self._supplier_plan(), QUEUE_POLICY)

        self.assertEqual(queue["summary"]["requestCount"], 1)
        request = queue["nextRequest"]
        self.assertEqual(request["state"], "draft")
        self.assertTrue(request["approvalRequired"])
        self.assertFalse(request["externalDeliveryAllowed"])
        self.assertIn("manufacturer.contact", request["fieldPath"])
        self.assertIn(request["fieldPath"], request["draft"]["subject"])
        self.assertIn("not been sent", request["draft"]["body"])
        self.assertEqual(request["history"][0]["event"], "created")

    def test_non_supplier_gap_does_not_create_request(self):
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["identification"]["place_of_manufacture"]
        plan = AUTOPILOT.build_plan(CATALOG, fixture, AUTOPILOT_POLICY)

        queue = QUEUE.build_supplier_queue(plan, QUEUE_POLICY)

        self.assertEqual(queue["summary"]["requestCount"], 0)
        self.assertIsNone(queue["nextRequest"])

    def test_queue_is_deterministic(self):
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["identification"]["manufacturer"]["contact"]
        del fixture["model"]["carbon_footprint"]
        plan = AUTOPILOT.build_plan(CATALOG, fixture, AUTOPILOT_POLICY)

        first = QUEUE.build_supplier_queue(plan, QUEUE_POLICY)
        second = QUEUE.build_supplier_queue(plan, QUEUE_POLICY)

        self.assertEqual(first, second)
        self.assertEqual(
            [request["fieldPath"] for request in first["requests"]],
            sorted(request["fieldPath"] for request in first["requests"]),
        )

    def test_invalid_transition_fails_closed(self):
        request = QUEUE.build_supplier_queue(self._supplier_plan(), QUEUE_POLICY)["nextRequest"]

        with self.assertRaisesRegex(QUEUE.SupplierQueueError, "invalid supplier queue transition"):
            QUEUE.transition_request(
                request,
                "ready_to_send",
                QUEUE_POLICY,
                approval_reference="approval-1",
            )

    def test_approval_requires_reference(self):
        request = QUEUE.build_supplier_queue(self._supplier_plan(), QUEUE_POLICY)["nextRequest"]

        with self.assertRaisesRegex(QUEUE.SupplierQueueError, "approval reference"):
            QUEUE.transition_request(request, "approved", QUEUE_POLICY)

    def test_mark_sent_requires_delivery_receipt(self):
        request = QUEUE.build_supplier_queue(self._supplier_plan(), QUEUE_POLICY)["nextRequest"]
        request = QUEUE.transition_request(
            request,
            "approved",
            QUEUE_POLICY,
            approval_reference="approval-1",
        )
        request = QUEUE.transition_request(request, "ready_to_send", QUEUE_POLICY)

        with self.assertRaisesRegex(QUEUE.SupplierQueueError, "delivery receipt"):
            QUEUE.transition_request(request, "awaiting_response", QUEUE_POLICY)

    def test_full_supplier_state_machine_requires_evidence_and_human_review(self):
        request = QUEUE.build_supplier_queue(self._supplier_plan(), QUEUE_POLICY)["nextRequest"]

        approved = QUEUE.transition_request(
            request,
            "approved",
            QUEUE_POLICY,
            approval_reference="approval-1",
        )
        ready = QUEUE.transition_request(approved, "ready_to_send", QUEUE_POLICY)
        awaiting = QUEUE.transition_request(
            ready,
            "awaiting_response",
            QUEUE_POLICY,
            delivery_receipt="mail-provider-receipt-001",
        )

        with self.assertRaisesRegex(QUEUE.SupplierQueueError, "response evidence"):
            QUEUE.transition_request(awaiting, "response_received", QUEUE_POLICY)

        received = QUEUE.transition_request(
            awaiting,
            "response_received",
            QUEUE_POLICY,
            response_evidence={
                "reference": "evidence-object-001",
                "sha256": "b" * 64,
            },
        )

        with self.assertRaisesRegex(QUEUE.SupplierQueueError, "human review"):
            QUEUE.transition_request(received, "ingested", QUEUE_POLICY)

        ingested = QUEUE.transition_request(
            received,
            "ingested",
            QUEUE_POLICY,
            human_reviewed=True,
        )

        self.assertEqual(ingested["state"], "ingested")
        self.assertTrue(ingested["humanReviewed"])
        self.assertEqual(ingested["approvalReference"], "approval-1")
        self.assertEqual(ingested["deliveryReceipt"], "mail-provider-receipt-001")
        self.assertEqual(ingested["responseEvidence"]["reference"], "evidence-object-001")
        self.assertEqual(
            [event["to"] for event in ingested["history"]],
            [
                "draft",
                "approved",
                "ready_to_send",
                "awaiting_response",
                "response_received",
                "ingested",
            ],
        )

    def test_attach_queue_does_not_mutate_plan(self):
        plan = self._supplier_plan()
        original = copy.deepcopy(plan)
        enriched = QUEUE.attach_supplier_queue(plan, QUEUE_POLICY)

        self.assertEqual(plan, original)
        self.assertIn("supplierQueue", enriched)
        self.assertNotIn("supplierQueue", plan)


if __name__ == "__main__":
    unittest.main()
