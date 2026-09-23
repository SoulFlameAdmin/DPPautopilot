#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
from typing import Any


class SupplierQueueError(ValueError):
    pass


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise SupplierQueueError(message)


def validate_supplier_queue_policy(policy: dict[str, Any]) -> None:
    _require(isinstance(policy, dict), "supplier queue policy must be an object")
    _require(bool(policy.get("version")), "supplier queue policy version missing")
    _require(
        policy.get("mode") == "draft_only_no_delivery",
        "unexpected supplier queue mode",
    )

    transitions = policy.get("transitions")
    _require(isinstance(transitions, dict) and transitions, "transitions must be an object")
    expected_states = {
        "draft",
        "approved",
        "ready_to_send",
        "awaiting_response",
        "response_received",
        "ingested",
    }
    _require(set(transitions.keys()) == expected_states, "supplier queue states are incomplete")

    safety = policy.get("safety") or {}
    _require(safety.get("allowExternalDelivery") is False, "queue must not deliver externally")
    _require(safety.get("requireApprovalReference") is True, "approval reference is required")
    _require(
        safety.get("requireDeliveryReceiptToMarkSent") is True,
        "delivery receipt is required",
    )
    _require(safety.get("requireResponseEvidence") is True, "response evidence is required")
    _require(
        safety.get("requireHumanReviewBeforeIngest") is True,
        "human review is required before ingest",
    )


def _queue_id(action_id: str) -> str:
    digest = hashlib.sha256(f"supplier|{action_id}".encode("utf-8")).hexdigest()[:12]
    return f"supplier-{digest}"


def _eligible(action: dict[str, Any], policy: dict[str, Any]) -> bool:
    return (
        action.get("action") in set(policy.get("eligibleActions") or [])
        or action.get("source") in set(policy.get("eligibleSources") or [])
    )


def build_supplier_queue(plan: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    validate_supplier_queue_policy(policy)
    actions = plan.get("actions")
    _require(isinstance(actions, list), "planner actions must be an array")
    _require(all(isinstance(action, dict) for action in actions), "planner actions must be objects")

    items: list[dict[str, Any]] = []
    for action in actions:
        if not _eligible(action, policy):
            continue
        action_id = action.get("id")
        field_path = action.get("fieldPath")
        _require(isinstance(action_id, str) and action_id, "supplier action id is required")
        _require(isinstance(field_path, str) and field_path, "supplier fieldPath is required")

        item = {
            "id": _queue_id(action_id),
            "actionId": action_id,
            "fieldPath": field_path,
            "requestedSource": action.get("source"),
            "state": "draft",
            "approvalRequired": True,
            "externalDeliveryAllowed": False,
            "draft": {
                "subject": f"DPP data request: {field_path}",
                "body": (
                    "Please provide the source data or evidence required for "
                    f"{field_path}. This draft has not been sent."
                ),
            },
            "history": [
                {
                    "from": None,
                    "to": "draft",
                    "event": "created",
                }
            ],
        }
        items.append(item)

    items.sort(key=lambda item: (item["fieldPath"], item["id"]))
    return {
        "mode": policy["mode"],
        "summary": {
            "requestCount": len(items),
            "externalDeliveryAllowed": False,
            "allRequestsRequireApproval": True,
        },
        "nextRequest": items[0] if items else None,
        "requests": items,
    }


def _transition_allowed(state: str, target: str, policy: dict[str, Any]) -> bool:
    return target in (policy["transitions"].get(state) or [])


def transition_request(
    request: dict[str, Any],
    target_state: str,
    policy: dict[str, Any],
    *,
    approval_reference: str | None = None,
    delivery_receipt: str | None = None,
    response_evidence: dict[str, Any] | None = None,
    human_reviewed: bool = False,
) -> dict[str, Any]:
    validate_supplier_queue_policy(policy)
    _require(isinstance(request, dict), "supplier request must be an object")
    current = request.get("state")
    _require(isinstance(current, str), "supplier request state missing")
    _require(target_state in policy["transitions"], f"unknown target state: {target_state}")
    _require(
        _transition_allowed(current, target_state, policy),
        f"invalid supplier queue transition: {current} -> {target_state}",
    )

    updated = copy.deepcopy(request)
    event: dict[str, Any] = {
        "from": current,
        "to": target_state,
    }

    if target_state == "approved":
        _require(
            isinstance(approval_reference, str) and approval_reference.strip(),
            "approval reference is required",
        )
        updated["approvalReference"] = approval_reference.strip()
        event["event"] = "approved"
        event["approvalReference"] = approval_reference.strip()

    elif target_state == "ready_to_send":
        _require(
            isinstance(updated.get("approvalReference"), str)
            and updated["approvalReference"].strip(),
            "approved request is missing approval reference",
        )
        event["event"] = "prepared_for_delivery"

    elif target_state == "awaiting_response":
        _require(
            isinstance(delivery_receipt, str) and delivery_receipt.strip(),
            "delivery receipt is required before marking sent",
        )
        updated["deliveryReceipt"] = delivery_receipt.strip()
        event["event"] = "delivery_recorded"
        event["deliveryReceipt"] = delivery_receipt.strip()

    elif target_state == "response_received":
        _require(
            isinstance(response_evidence, dict) and response_evidence,
            "response evidence is required",
        )
        _require(
            isinstance(response_evidence.get("reference"), str)
            and response_evidence["reference"].strip(),
            "response evidence reference is required",
        )
        updated["responseEvidence"] = copy.deepcopy(response_evidence)
        event["event"] = "response_recorded"
        event["responseReference"] = response_evidence["reference"].strip()

    elif target_state == "ingested":
        _require(human_reviewed is True, "human review is required before ingest")
        _require(
            isinstance(updated.get("responseEvidence"), dict)
            and updated["responseEvidence"],
            "response evidence is required before ingest",
        )
        updated["humanReviewed"] = True
        event["event"] = "ingested_after_human_review"

    updated["state"] = target_state
    history = updated.get("history")
    _require(isinstance(history, list), "supplier request history must be an array")
    history.append(event)
    return updated


def attach_supplier_queue(
    plan: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    result = copy.deepcopy(plan)
    result["supplierQueue"] = build_supplier_queue(plan, policy)
    return result
