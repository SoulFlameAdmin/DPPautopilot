#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any


class RegistryOrchestrationError(ValueError):
    pass


UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
SENSITIVE_KEYS = {
    "authorization",
    "access_token",
    "refresh_token",
    "api_key",
    "apikey",
    "client_secret",
    "password",
    "service_role_key",
}
EXPECTED_TRANSITIONS = {
    "draft": {"queued", "cancelled"},
    "queued": {"submitted", "cancelled", "failed"},
    "submitted": {"accepted", "rejected", "retry_wait", "failed"},
    "accepted": set(),
    "rejected": {"retry_wait", "cancelled"},
    "retry_wait": {"queued", "cancelled", "failed"},
    "failed": set(),
    "cancelled": set(),
}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RegistryOrchestrationError(message)


def _valid_uuid(value: Any) -> bool:
    return isinstance(value, str) and UUID_RE.fullmatch(value) is not None


def _reject_secrets(value: Any, path: str = "registryPayload") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower()
            _require(
                normalized not in SENSITIVE_KEYS,
                f"{path} contains forbidden credential field {key}",
            )
            _reject_secrets(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_secrets(child, f"{path}[{index}]")


def validate_policy(policy: dict[str, Any]) -> None:
    _require(isinstance(policy, dict), "registry orchestration policy must be an object")
    _require(bool(policy.get("version")), "registry orchestration policy version missing")
    _require(
        policy.get("mode") == "provider_neutral_no_network_submission",
        "unexpected registry orchestration mode",
    )
    allowed_envs = policy.get("allowedEnvironments")
    _require(
        isinstance(allowed_envs, list)
        and set(allowed_envs) == {"test", "live"},
        "allowedEnvironments must contain test and live",
    )
    _require(
        policy.get("defaultEnvironment") in allowed_envs,
        "defaultEnvironment must be allowed",
    )
    provider = policy.get("defaultProvider")
    _require(
        isinstance(provider, str) and 1 <= len(provider.strip()) <= 80,
        "defaultProvider must contain 1..80 characters",
    )

    transitions = policy.get("transitions")
    _require(isinstance(transitions, dict), "registry transitions must be an object")
    _require(set(transitions.keys()) == set(EXPECTED_TRANSITIONS.keys()), "registry states are incomplete")
    for state, expected in EXPECTED_TRANSITIONS.items():
        actual = transitions.get(state)
        _require(isinstance(actual, list), f"registry transitions[{state}] must be an array")
        _require(set(actual) == expected, f"registry transitions[{state}] diverge from DB contract")

    safety = policy.get("safety") or {}
    _require(safety.get("allowNetworkSubmission") is False, "network submission must remain disabled")
    _require(safety.get("requireCompletePlan") is True, "complete plan gate must be required")
    _require(safety.get("requireApprovalToQueue") is True, "approval-to-queue gate must be required")
    _require(
        safety.get("requireExternalReceiptToMarkSubmitted") is True,
        "external receipt must be required to mark submitted",
    )
    _require(
        safety.get("requireRegistryResponseForDecision") is True,
        "registry response must be required for decisions",
    )
    _require(safety.get("requireRetryEvidence") is True, "retry evidence must be required")
    _require(
        safety.get("requireDeterministicIdempotency") is True,
        "deterministic idempotency must be required",
    )


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _semantic_fingerprint(context: dict[str, Any]) -> str:
    semantic = {
        "organizationId": context["organizationId"],
        "batteryItemId": context["batteryItemId"],
        "passportId": context["passportId"],
        "environment": context["environment"],
        "provider": context["provider"],
        "requestPayload": context["requestPayload"],
    }
    return hashlib.sha256(_canonical_json(semantic).encode("utf-8")).hexdigest()


def normalize_context(context: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    _require(isinstance(context, dict), "registry context must be a JSON object")
    _reject_secrets(context)
    for key in ("organizationId", "batteryItemId", "passportId"):
        _require(_valid_uuid(context.get(key)), f"registry {key} must be a valid UUID")

    environment = context.get("environment", policy["defaultEnvironment"])
    _require(environment in policy["allowedEnvironments"], "invalid registry environment")
    provider = context.get("provider", policy["defaultProvider"])
    _require(
        isinstance(provider, str) and 1 <= len(provider.strip()) <= 80,
        "registry provider must contain 1..80 characters",
    )
    payload = context.get("requestPayload")
    _require(isinstance(payload, dict), "registry requestPayload must be an object")
    _reject_secrets(payload)

    normalized = {
        "organizationId": context["organizationId"],
        "batteryItemId": context["batteryItemId"],
        "passportId": context["passportId"],
        "environment": environment,
        "provider": provider.strip(),
        "requestPayload": copy.deepcopy(payload),
    }
    fingerprint = _semantic_fingerprint(normalized)
    requested_key = context.get("idempotencyKey")
    if requested_key is None:
        idempotency_key = f"david-{fingerprint[:24]}"
    else:
        _require(
            isinstance(requested_key, str)
            and 1 <= len(requested_key.strip()) <= 120,
            "registry idempotencyKey must contain 1..120 characters",
        )
        idempotency_key = requested_key.strip()
    normalized["idempotencyKey"] = idempotency_key
    normalized["semanticFingerprint"] = fingerprint
    return normalized


def build_registry_submission(
    plan: dict[str, Any],
    context: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    validate_policy(policy)
    _require(isinstance(plan, dict), "planner output must be an object")
    summary = plan.get("summary") or {}
    _require(
        plan.get("status") == "complete" and summary.get("actionCount") == 0,
        "registry submission requires a complete plan with zero open actions",
    )

    normalized = normalize_context(context, policy)
    submission_id = f"registry-{normalized['semanticFingerprint'][:12]}"
    return {
        "id": submission_id,
        **normalized,
        "status": "draft",
        "approvalRequired": True,
        "networkSubmissionAllowed": False,
        "attemptCount": 0,
        "history": [
            {
                "from": None,
                "to": "draft",
                "event": "created",
            }
        ],
    }


def _transition_allowed(state: str, target: str, policy: dict[str, Any]) -> bool:
    return target in (policy["transitions"].get(state) or [])


def transition_registry_submission(
    submission: dict[str, Any],
    target_status: str,
    policy: dict[str, Any],
    *,
    approval_reference: str | None = None,
    submission_receipt: dict[str, Any] | None = None,
    registry_response: dict[str, Any] | None = None,
    retry_evidence: dict[str, Any] | None = None,
    failure_evidence: dict[str, Any] | None = None,
    cancellation_reference: str | None = None,
) -> dict[str, Any]:
    validate_policy(policy)
    _require(isinstance(submission, dict), "registry submission must be an object")
    current = submission.get("status")
    _require(isinstance(current, str), "registry submission status missing")
    _require(target_status in policy["transitions"], f"unknown registry status: {target_status}")
    _require(
        _transition_allowed(current, target_status, policy),
        f"invalid registry transition: {current} -> {target_status}",
    )

    updated = copy.deepcopy(submission)
    event: dict[str, Any] = {"from": current, "to": target_status}

    if target_status == "queued":
        if current == "draft":
            _require(
                isinstance(approval_reference, str) and approval_reference.strip(),
                "approval reference is required before queueing",
            )
            updated["approvalReference"] = approval_reference.strip()
            event["approvalReference"] = approval_reference.strip()
        else:
            _require(
                isinstance(updated.get("retryEvidence"), dict)
                and updated["retryEvidence"],
                "retry evidence is required before requeue",
            )
        event["event"] = "queued"

    elif target_status == "submitted":
        _require(
            isinstance(submission_receipt, dict) and submission_receipt,
            "external submission receipt is required",
        )
        external_reference = submission_receipt.get("externalReference")
        _require(
            isinstance(external_reference, str)
            and 1 <= len(external_reference.strip()) <= 300,
            "submission receipt externalReference is required",
        )
        updated["externalReference"] = external_reference.strip()
        updated["submissionReceipt"] = copy.deepcopy(submission_receipt)
        updated["attemptCount"] = int(updated.get("attemptCount") or 0) + 1
        event["event"] = "external_submission_recorded"
        event["externalReference"] = external_reference.strip()

    elif target_status in {"accepted", "rejected"}:
        _require(
            isinstance(registry_response, dict) and registry_response,
            "registry response is required for decision",
        )
        _require(
            isinstance(updated.get("externalReference"), str)
            and updated["externalReference"].strip(),
            "externalReference is required before registry decision",
        )
        updated["registryResponse"] = copy.deepcopy(registry_response)
        event["event"] = f"registry_{target_status}"

    elif target_status == "retry_wait":
        _require(
            isinstance(retry_evidence, dict) and retry_evidence,
            "retry evidence is required",
        )
        error_code = retry_evidence.get("errorCode")
        next_retry_at = retry_evidence.get("nextRetryAt")
        _require(
            isinstance(error_code, str) and error_code.strip(),
            "retry evidence errorCode is required",
        )
        _require(
            isinstance(next_retry_at, str) and next_retry_at.strip(),
            "retry evidence nextRetryAt is required",
        )
        updated["retryEvidence"] = copy.deepcopy(retry_evidence)
        event["event"] = "retry_scheduled"
        event["errorCode"] = error_code.strip()

    elif target_status == "failed":
        _require(
            isinstance(failure_evidence, dict) and failure_evidence,
            "failure evidence is required",
        )
        _require(
            isinstance(failure_evidence.get("errorCode"), str)
            and failure_evidence["errorCode"].strip(),
            "failure evidence errorCode is required",
        )
        updated["failureEvidence"] = copy.deepcopy(failure_evidence)
        event["event"] = "failed"
        event["errorCode"] = failure_evidence["errorCode"].strip()

    elif target_status == "cancelled":
        _require(
            isinstance(cancellation_reference, str)
            and cancellation_reference.strip(),
            "cancellation reference is required",
        )
        updated["cancellationReference"] = cancellation_reference.strip()
        event["event"] = "cancelled"
        event["cancellationReference"] = cancellation_reference.strip()

    updated["status"] = target_status
    history = updated.get("history")
    _require(isinstance(history, list), "registry submission history must be an array")
    history.append(event)
    return updated


def attach_registry_submission(
    plan: dict[str, Any],
    context: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    result = copy.deepcopy(plan)
    result["registryOrchestration"] = build_registry_submission(plan, context, policy)
    return result
