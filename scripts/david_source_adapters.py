#!/usr/bin/env python3
from __future__ import annotations

import copy
import re
from typing import Any


class SourceAdapterError(ValueError):
    pass


KNOWN_ADAPTERS = {"erp", "bms", "plm", "evidence"}
SENSITIVE_KEYS = {
    "authorization",
    "access_token",
    "refresh_token",
    "service_role_key",
    "apikey",
    "api_key",
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$", re.IGNORECASE)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise SourceAdapterError(message)


def validate_adapter_policy(policy: dict[str, Any]) -> None:
    _require(isinstance(policy, dict), "adapter policy must be an object")
    _require(bool(policy.get("version")), "adapter policy version missing")
    _require(
        policy.get("mode") == "read_only_candidate_discovery",
        "unexpected source adapter mode",
    )

    adapter_order = policy.get("adapterOrder")
    _require(
        isinstance(adapter_order, list) and adapter_order,
        "adapterOrder must be a non-empty list",
    )
    _require(
        len(adapter_order) == len(set(adapter_order)),
        "adapterOrder must not contain duplicates",
    )
    _require(
        all(adapter in KNOWN_ADAPTERS for adapter in adapter_order),
        "adapterOrder contains an unsupported adapter",
    )

    source_to_adapters = policy.get("sourceToAdapters")
    _require(
        isinstance(source_to_adapters, dict) and source_to_adapters,
        "sourceToAdapters must be a non-empty object",
    )
    for source, adapters in source_to_adapters.items():
        _require(
            isinstance(source, str) and source.strip(),
            "sourceToAdapters keys must be non-empty strings",
        )
        _require(
            isinstance(adapters, list) and adapters,
            f"sourceToAdapters[{source}] must be a non-empty list",
        )
        _require(
            all(adapter in KNOWN_ADAPTERS for adapter in adapters),
            f"sourceToAdapters[{source}] contains unsupported adapter",
        )

    safety = policy.get("safety") or {}
    _require(safety.get("allowWrites") is False, "source adapters must remain read-only")
    _require(
        safety.get("allowExternalSideEffects") is False,
        "source adapters must forbid external side effects",
    )
    _require(
        safety.get("evidenceRequiresApproval") is True,
        "evidence candidates must require approval",
    )
    _require(
        safety.get("requireProvenance") is True,
        "source candidates must require provenance",
    )


def _reject_secrets(value: Any, path: str = "sourceSnapshot") -> None:
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


def _normalize_internal_records(snapshot: dict[str, Any], adapter: str) -> list[dict[str, Any]]:
    raw = snapshot.get(adapter)
    if raw is None:
        return []
    records = raw if isinstance(raw, list) else [raw]
    _require(
        all(isinstance(record, dict) for record in records),
        f"{adapter} source records must be objects",
    )

    normalized: list[dict[str, Any]] = []
    for record in records:
        record_id = record.get("recordId")
        fields = record.get("fields")
        _require(
            isinstance(record_id, str) and record_id.strip(),
            f"{adapter} recordId is required",
        )
        _require(
            isinstance(fields, dict),
            f"{adapter} fields must be an object",
        )
        normalized.append(record)

    return sorted(normalized, key=lambda record: str(record["recordId"]))


def _normalize_evidence(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    raw = snapshot.get("evidence")
    if raw is None:
        return []
    documents = raw if isinstance(raw, list) else [raw]
    _require(
        all(isinstance(document, dict) for document in documents),
        "evidence documents must be objects",
    )

    normalized: list[dict[str, Any]] = []
    for document in documents:
        document_id = document.get("documentId")
        sha256 = document.get("sha256")
        claims = document.get("claims")
        _require(
            isinstance(document_id, str) and document_id.strip(),
            "evidence documentId is required",
        )
        _require(
            isinstance(sha256, str) and SHA256_RE.fullmatch(sha256) is not None,
            f"evidence {document_id} requires a valid SHA-256",
        )
        _require(
            isinstance(claims, list),
            f"evidence {document_id} claims must be an array",
        )

        normalized_claims: list[dict[str, Any]] = []
        for claim in claims:
            _require(
                isinstance(claim, dict),
                f"evidence {document_id} claims must be objects",
            )
            field_path = claim.get("fieldPath")
            confidence = claim.get("confidence")
            _require(
                isinstance(field_path, str) and field_path.strip(),
                f"evidence {document_id} claim fieldPath is required",
            )
            _require(
                "value" in claim and claim.get("value") is not None,
                f"evidence {document_id} claim {field_path} value is required",
            )
            _require(
                isinstance(confidence, (int, float))
                and not isinstance(confidence, bool)
                and 0.0 <= float(confidence) <= 1.0,
                f"evidence {document_id} claim {field_path} confidence must be 0..1",
            )
            normalized_claims.append(claim)

        normalized.append({**document, "claims": normalized_claims})

    return sorted(normalized, key=lambda document: str(document["documentId"]))


def validate_source_snapshot(snapshot: dict[str, Any]) -> None:
    _require(isinstance(snapshot, dict), "source snapshot must be a JSON object")
    allowed = {"snapshotVersion", "erp", "bms", "plm", "evidence"}
    unknown = sorted(str(key) for key in snapshot.keys() if key not in allowed)
    _require(not unknown, f"source snapshot contains unsupported keys: {', '.join(unknown)}")
    _require(bool(snapshot.get("snapshotVersion")), "source snapshotVersion missing")
    _reject_secrets(snapshot)
    for adapter in ("erp", "bms", "plm"):
        _normalize_internal_records(snapshot, adapter)
    _normalize_evidence(snapshot)


def _allowed_adapters(action: dict[str, Any], policy: dict[str, Any]) -> list[str]:
    source = action.get("source")
    configured = policy["sourceToAdapters"].get(source, [])
    order = policy["adapterOrder"]
    return [adapter for adapter in order if adapter in configured]


def _internal_candidates(
    action: dict[str, Any],
    records: list[dict[str, Any]],
    adapter: str,
) -> list[dict[str, Any]]:
    field_path = action["fieldPath"]
    candidates: list[dict[str, Any]] = []
    for record in records:
        fields = record["fields"]
        if field_path not in fields or fields[field_path] is None:
            continue
        approval_required = bool(action.get("approvalRequired"))
        candidates.append(
            {
                "actionId": action["id"],
                "fieldPath": field_path,
                "adapter": adapter,
                "value": copy.deepcopy(fields[field_path]),
                "approvalRequired": approval_required,
                "state": (
                    "approval_required"
                    if approval_required
                    else "ready_for_safe_local_automation"
                ),
                "provenance": {
                    "recordId": record["recordId"],
                    "source": action.get("source"),
                },
            }
        )
    return candidates


def _evidence_candidates(
    action: dict[str, Any],
    documents: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    field_path = action["fieldPath"]
    candidates: list[dict[str, Any]] = []
    for document in documents:
        claims = sorted(
            (
                claim
                for claim in document["claims"]
                if claim.get("fieldPath") == field_path
            ),
            key=lambda claim: (
                str(claim.get("extractor") or ""),
                repr(claim.get("value")),
                float(claim.get("confidence")),
            ),
        )
        for claim in claims:
            provenance = {
                "documentId": document["documentId"],
                "sha256": document["sha256"].lower(),
                "confidence": float(claim["confidence"]),
                "source": action.get("source"),
            }
            extractor = claim.get("extractor")
            if extractor is not None:
                _require(
                    isinstance(extractor, str) and extractor.strip(),
                    f"evidence {document['documentId']} extractor must be a non-empty string",
                )
                provenance["extractor"] = extractor

            candidates.append(
                {
                    "actionId": action["id"],
                    "fieldPath": field_path,
                    "adapter": "evidence",
                    "value": copy.deepcopy(claim["value"]),
                    "approvalRequired": True,
                    "state": "approval_required",
                    "provenance": provenance,
                }
            )
    return candidates


def discover_source_candidates(
    plan: dict[str, Any],
    snapshot: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    validate_adapter_policy(policy)
    validate_source_snapshot(snapshot)

    actions = plan.get("actions")
    _require(isinstance(actions, list), "planner actions must be an array")
    _require(
        all(isinstance(action, dict) for action in actions),
        "planner actions must contain objects",
    )

    internal = {
        adapter: _normalize_internal_records(snapshot, adapter)
        for adapter in ("erp", "bms", "plm")
    }
    evidence = _normalize_evidence(snapshot)

    candidates: list[dict[str, Any]] = []
    resolved_action_ids: set[str] = set()

    for action in actions:
        for adapter in _allowed_adapters(action, policy):
            if adapter == "evidence":
                found = _evidence_candidates(action, evidence)
            else:
                found = _internal_candidates(action, internal[adapter], adapter)
            if found:
                resolved_action_ids.add(str(action.get("id")))
                candidates.extend(found)

    safe_local = sum(
        1 for candidate in candidates if not candidate["approvalRequired"]
    )
    approval_required = len(candidates) - safe_local
    unresolved = sum(
        1 for action in actions if str(action.get("id")) not in resolved_action_ids
    )

    return {
        "mode": policy["mode"],
        "snapshotVersion": snapshot["snapshotVersion"],
        "summary": {
            "candidateCount": len(candidates),
            "safeLocalCandidateCount": safe_local,
            "approvalRequiredCandidateCount": approval_required,
            "unresolvedActionCount": unresolved,
            "writesAllowed": False,
            "externalSideEffectsAllowed": False,
        },
        "nextCandidate": candidates[0] if candidates else None,
        "candidates": candidates,
    }


def attach_source_candidates(
    plan: dict[str, Any],
    snapshot: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    result = copy.deepcopy(plan)
    result["sourceDiscovery"] = discover_source_candidates(plan, snapshot, policy)
    return result
