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


AUTOPILOT = load_module("david_autopilot_registry_tests", "scripts/david_autopilot.py")
REGISTRY = load_module("david_registry_orchestrator_test_module", "scripts/david_registry_orchestrator.py")

CATALOG = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))
AUTOPILOT_POLICY = json.loads((ROOT / "data/david-autopilot-policy.json").read_text(encoding="utf-8"))
REGISTRY_POLICY = json.loads((ROOT / "data/david-registry-orchestration-policy.json").read_text(encoding="utf-8"))

ORG_ID = "11111111-1111-4111-8111-111111111111"
ITEM_ID = "22222222-2222-4222-8222-222222222222"
PASSPORT_ID = "33333333-3333-4333-8333-333333333333"


def registry_context(**overrides) -> dict:
    context = {
        "organizationId": ORG_ID,
        "batteryItemId": ITEM_ID,
        "passportId": PASSPORT_ID,
        "environment": "test",
        "provider": "eu_dpp_registry",
        "requestPayload": {
            "passport_id": PASSPORT_ID,
            "battery_item_id": ITEM_ID,
            "version": 1,
        },
    }
    context.update(overrides)
    return context


class DavidRegistryOrchestrationTests(unittest.TestCase):
    def _complete_plan(self) -> dict:
        return AUTOPILOT.build_plan(CATALOG, FIXTURE, AUTOPILOT_POLICY)

    def test_complete_plan_builds_deterministic_registry_draft(self):
        plan = self._complete_plan()

        first = REGISTRY.build_registry_submission(plan, registry_context(), REGISTRY_POLICY)
        second = REGISTRY.build_registry_submission(plan, registry_context(), REGISTRY_POLICY)

        self.assertEqual(first, second)
        self.assertEqual(first["status"], "draft")
        self.assertFalse(first["networkSubmissionAllowed"])
        self.assertTrue(first["approvalRequired"])
        self.assertEqual(first["attemptCount"], 0)
        self.assertTrue(first["idempotencyKey"].startswith("david-"))
        self.assertEqual(len(first["semanticFingerprint"]), 64)
        self.assertEqual(first["history"][0]["event"], "created")

    def test_incomplete_plan_cannot_create_registry_submission(self):
        fixture = copy.deepcopy(FIXTURE)
        del fixture["model"]["carbon_footprint"]
        plan = AUTOPILOT.build_plan(CATALOG, fixture, AUTOPILOT_POLICY)

        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "complete plan"):
            REGISTRY.build_registry_submission(plan, registry_context(), REGISTRY_POLICY)

    def test_invalid_environment_fails_closed(self):
        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "invalid registry environment"):
            REGISTRY.build_registry_submission(
                self._complete_plan(),
                registry_context(environment="production"),
                REGISTRY_POLICY,
            )

    def test_invalid_uuid_fails_closed(self):
        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "organizationId"):
            REGISTRY.build_registry_submission(
                self._complete_plan(),
                registry_context(organizationId="not-a-uuid"),
                REGISTRY_POLICY,
            )

    def test_registry_payload_credentials_are_rejected(self):
        context = registry_context()
        context["requestPayload"]["authorization"] = "Bearer forbidden"

        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "forbidden credential field"):
            REGISTRY.build_registry_submission(
                self._complete_plan(),
                context,
                REGISTRY_POLICY,
            )

    def test_custom_idempotency_key_is_preserved(self):
        submission = REGISTRY.build_registry_submission(
            self._complete_plan(),
            registry_context(idempotencyKey="customer-run-001"),
            REGISTRY_POLICY,
        )

        self.assertEqual(submission["idempotencyKey"], "customer-run-001")

    def test_queueing_requires_explicit_approval(self):
        submission = REGISTRY.build_registry_submission(
            self._complete_plan(),
            registry_context(),
            REGISTRY_POLICY,
        )

        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "approval reference"):
            REGISTRY.transition_registry_submission(
                submission,
                "queued",
                REGISTRY_POLICY,
            )

        queued = REGISTRY.transition_registry_submission(
            submission,
            "queued",
            REGISTRY_POLICY,
            approval_reference="approval-001",
        )
        self.assertEqual(queued["status"], "queued")
        self.assertEqual(queued["approvalReference"], "approval-001")

    def test_mark_submitted_requires_external_receipt(self):
        draft = REGISTRY.build_registry_submission(
            self._complete_plan(),
            registry_context(),
            REGISTRY_POLICY,
        )
        queued = REGISTRY.transition_registry_submission(
            draft,
            "queued",
            REGISTRY_POLICY,
            approval_reference="approval-001",
        )

        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "external submission receipt"):
            REGISTRY.transition_registry_submission(
                queued,
                "submitted",
                REGISTRY_POLICY,
            )

        submitted = REGISTRY.transition_registry_submission(
            queued,
            "submitted",
            REGISTRY_POLICY,
            submission_receipt={
                "externalReference": "REG-EXT-0001",
                "transport": "external-adapter",
            },
        )
        self.assertEqual(submitted["status"], "submitted")
        self.assertEqual(submitted["externalReference"], "REG-EXT-0001")
        self.assertEqual(submitted["attemptCount"], 1)

    def test_registry_decision_requires_response(self):
        draft = REGISTRY.build_registry_submission(
            self._complete_plan(),
            registry_context(),
            REGISTRY_POLICY,
        )
        queued = REGISTRY.transition_registry_submission(
            draft,
            "queued",
            REGISTRY_POLICY,
            approval_reference="approval-001",
        )
        submitted = REGISTRY.transition_registry_submission(
            queued,
            "submitted",
            REGISTRY_POLICY,
            submission_receipt={"externalReference": "REG-EXT-0001"},
        )

        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "registry response"):
            REGISTRY.transition_registry_submission(
                submitted,
                "accepted",
                REGISTRY_POLICY,
            )

        accepted = REGISTRY.transition_registry_submission(
            submitted,
            "accepted",
            REGISTRY_POLICY,
            registry_response={"status": "accepted", "providerCode": "OK"},
        )
        self.assertEqual(accepted["status"], "accepted")
        self.assertEqual(accepted["registryResponse"]["providerCode"], "OK")

    def test_rejected_submission_can_enter_retry_wait_and_requeue(self):
        draft = REGISTRY.build_registry_submission(
            self._complete_plan(),
            registry_context(),
            REGISTRY_POLICY,
        )
        queued = REGISTRY.transition_registry_submission(
            draft,
            "queued",
            REGISTRY_POLICY,
            approval_reference="approval-001",
        )
        submitted = REGISTRY.transition_registry_submission(
            queued,
            "submitted",
            REGISTRY_POLICY,
            submission_receipt={"externalReference": "REG-EXT-0001"},
        )
        rejected = REGISTRY.transition_registry_submission(
            submitted,
            "rejected",
            REGISTRY_POLICY,
            registry_response={"status": "rejected", "reason": "temporary_validation_issue"},
        )

        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "retry evidence"):
            REGISTRY.transition_registry_submission(
                rejected,
                "retry_wait",
                REGISTRY_POLICY,
            )

        retry_wait = REGISTRY.transition_registry_submission(
            rejected,
            "retry_wait",
            REGISTRY_POLICY,
            retry_evidence={
                "errorCode": "TEMP_VALIDATION",
                "nextRetryAt": "2026-09-24T10:00:00Z",
            },
        )
        requeued = REGISTRY.transition_registry_submission(
            retry_wait,
            "queued",
            REGISTRY_POLICY,
        )

        self.assertEqual(requeued["status"], "queued")
        self.assertEqual(requeued["retryEvidence"]["errorCode"], "TEMP_VALIDATION")
        self.assertEqual(requeued["attemptCount"], 1)

    def test_invalid_transition_fails_closed(self):
        draft = REGISTRY.build_registry_submission(
            self._complete_plan(),
            registry_context(),
            REGISTRY_POLICY,
        )

        with self.assertRaisesRegex(REGISTRY.RegistryOrchestrationError, "invalid registry transition"):
            REGISTRY.transition_registry_submission(
                draft,
                "accepted",
                REGISTRY_POLICY,
                registry_response={"status": "accepted"},
            )

    def test_attach_does_not_mutate_plan(self):
        plan = self._complete_plan()
        original = copy.deepcopy(plan)
        enriched = REGISTRY.attach_registry_submission(
            plan,
            registry_context(),
            REGISTRY_POLICY,
        )

        self.assertEqual(plan, original)
        self.assertIn("registryOrchestration", enriched)
        self.assertNotIn("registryOrchestration", plan)


if __name__ == "__main__":
    unittest.main()
