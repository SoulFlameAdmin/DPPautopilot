#!/usr/bin/env python3
from __future__ import annotations

import copy
import re
from typing import Any


class EvidenceExtractionError(ValueError):
    pass


SENSITIVE_KEYS = {
    "authorization",
    "access_token",
    "refresh_token",
    "service_role_key",
    "apikey",
    "api_key",
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$", re.IGNORECASE)
CARBON_RE = re.compile(
    r"carbon\s+footprint\s*[:=]\s*(?P<total>\d+(?:\.\d+)?)\s*kg\s*co2e\s*/\s*kwh",
    re.IGNORECASE,
)
STUDY_RE = re.compile(
    r"study\s+reference\s*[:=]\s*(?P<reference>[A-Za-z0-9._:/-]{1,120})",
    re.IGNORECASE,
)
EU_DOC_RE = re.compile(
    r"eu\s+declaration\s+of\s+conformity(?:\s+reference)?\s*[:=]\s*(?P<reference>[A-Za-z0-9._:/-]{3,120})",
    re.IGNORECASE,
)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise EvidenceExtractionError(message)


def _reject_secrets(value: Any, path: str = "rawEvidence") -> None:
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
    _require(isinstance(policy, dict), "evidence extraction policy must be an object")
    _require(bool(policy.get("version")), "evidence extraction policy version missing")
    _require(
        policy.get("mode") == "deterministic_text_extraction_no_auto_accept",
        "unexpected evidence extraction mode",
    )
    rules = policy.get("rules")
    _require(isinstance(rules, list) and rules, "evidence extraction rules must be a non-empty array")

    seen_ids: set[str] = set()
    supported = {"carbon_footprint_v1", "eu_declaration_v1"}
    for index, rule in enumerate(rules):
        _require(isinstance(rule, dict), f"rules[{index}] must be an object")
        rule_id = rule.get("id")
        extractor = rule.get("extractor")
        field_path = rule.get("fieldPath")
        confidence = rule.get("confidence")
        _require(isinstance(rule_id, str) and rule_id.strip(), f"rules[{index}] id missing")
        _require(rule_id not in seen_ids, f"duplicate evidence extraction rule id: {rule_id}")
        seen_ids.add(rule_id)
        _require(extractor in supported, f"unsupported evidence extractor: {extractor}")
        _require(isinstance(field_path, str) and field_path.strip(), f"rules[{index}] fieldPath missing")
        _require(
            isinstance(confidence, (int, float))
            and not isinstance(confidence, bool)
            and 0.0 <= float(confidence) <= 1.0,
            f"rules[{index}] confidence must be 0..1",
        )

    safety = policy.get("safety") or {}
    _require(safety.get("allowAutoAccept") is False, "evidence extraction must not auto-accept")
    _require(safety.get("requireHumanApproval") is True, "human approval must be required")
    _require(safety.get("requireDocumentSha256") is True, "document SHA-256 must be required")
    _require(
        safety.get("requireDeterministicExtractor") is True,
        "deterministic extraction must be required",
    )
    _require(safety.get("preserveEvidenceSpan") is True, "evidence span must be preserved")
    max_excerpt = safety.get("maxExcerptChars")
    _require(
        isinstance(max_excerpt, int) and 40 <= max_excerpt <= 1000,
        "maxExcerptChars must be between 40 and 1000",
    )


def validate_raw_snapshot(snapshot: dict[str, Any]) -> None:
    _require(isinstance(snapshot, dict), "raw evidence snapshot must be a JSON object")
    _reject_secrets(snapshot)
    _require(bool(snapshot.get("snapshotVersion")), "raw evidence snapshotVersion missing")
    documents = snapshot.get("documents")
    _require(isinstance(documents, list), "raw evidence documents must be an array")

    seen_ids: set[str] = set()
    for index, document in enumerate(documents):
        _require(isinstance(document, dict), f"documents[{index}] must be an object")
        document_id = document.get("documentId")
        sha256 = document.get("sha256")
        text = document.get("text")
        media_type = document.get("mediaType", "text/plain")
        _require(
            isinstance(document_id, str) and document_id.strip(),
            f"documents[{index}] documentId missing",
        )
        _require(document_id not in seen_ids, f"duplicate documentId: {document_id}")
        seen_ids.add(document_id)
        _require(
            isinstance(sha256, str) and SHA256_RE.fullmatch(sha256) is not None,
            f"documents[{index}] requires a valid SHA-256",
        )
        _require(isinstance(text, str), f"documents[{index}] text must be a string")
        _require(len(text) <= 2_000_000, f"documents[{index}] text exceeds MVP extraction limit")
        _require(
            isinstance(media_type, str) and media_type.strip(),
            f"documents[{index}] mediaType must be a non-empty string",
        )


def _excerpt(text: str, start: int, end: int, limit: int) -> str:
    if len(text) <= limit:
        return text
    half = max(1, limit // 2)
    left = max(0, start - half)
    right = min(len(text), end + half)
    excerpt = text[left:right]
    if len(excerpt) > limit:
        excerpt = excerpt[:limit]
    return excerpt


def _claim(
    *,
    rule: dict[str, Any],
    document: dict[str, Any],
    value: Any,
    start: int,
    end: int,
    excerpt: str,
) -> dict[str, Any]:
    return {
        "fieldPath": rule["fieldPath"],
        "value": copy.deepcopy(value),
        "confidence": float(rule["confidence"]),
        "extractor": rule["extractor"],
        "approvalRequired": True,
        "state": "approval_required",
        "autoAccepted": False,
        "evidenceSpan": {
            "start": start,
            "end": end,
            "excerpt": excerpt,
        },
        "provenance": {
            "documentId": document["documentId"],
            "sha256": document["sha256"].lower(),
            "mediaType": document.get("mediaType", "text/plain"),
            "ruleId": rule["id"],
        },
    }


def _extract_carbon(
    rule: dict[str, Any],
    document: dict[str, Any],
    max_excerpt: int,
) -> list[dict[str, Any]]:
    text = document["text"]
    match = CARBON_RE.search(text)
    if match is None:
        return []

    value: dict[str, Any] = {
        "total_kg_co2e_per_kwh": float(match.group("total")),
    }
    study = STUDY_RE.search(text)
    start = match.start()
    end = match.end()
    if study is not None:
        value["study_reference"] = study.group("reference")
        start = min(start, study.start())
        end = max(end, study.end())

    return [
        _claim(
            rule=rule,
            document=document,
            value=value,
            start=start,
            end=end,
            excerpt=_excerpt(text, start, end, max_excerpt),
        )
    ]


def _extract_eu_declaration(
    rule: dict[str, Any],
    document: dict[str, Any],
    max_excerpt: int,
) -> list[dict[str, Any]]:
    text = document["text"]
    match = EU_DOC_RE.search(text)
    if match is None:
        return []
    return [
        _claim(
            rule=rule,
            document=document,
            value=match.group("reference"),
            start=match.start(),
            end=match.end(),
            excerpt=_excerpt(text, match.start(), match.end(), max_excerpt),
        )
    ]


def _extract_rule(
    rule: dict[str, Any],
    document: dict[str, Any],
    max_excerpt: int,
) -> list[dict[str, Any]]:
    extractor = rule["extractor"]
    if extractor == "carbon_footprint_v1":
        return _extract_carbon(rule, document, max_excerpt)
    if extractor == "eu_declaration_v1":
        return _extract_eu_declaration(rule, document, max_excerpt)
    raise EvidenceExtractionError(f"unsupported evidence extractor: {extractor}")


def extract_evidence(
    snapshot: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    validate_policy(policy)
    validate_raw_snapshot(snapshot)
    max_excerpt = int(policy["safety"]["maxExcerptChars"])

    documents_out: list[dict[str, Any]] = []
    total_claims = 0
    for document in sorted(snapshot["documents"], key=lambda item: item["documentId"]):
        claims: list[dict[str, Any]] = []
        for rule in policy["rules"]:
            claims.extend(_extract_rule(rule, document, max_excerpt))
        claims.sort(
            key=lambda claim: (
                claim["fieldPath"],
                claim["extractor"],
                repr(claim["value"]),
            )
        )
        total_claims += len(claims)
        documents_out.append(
            {
                "documentId": document["documentId"],
                "sha256": document["sha256"].lower(),
                "mediaType": document.get("mediaType", "text/plain"),
                "claims": claims,
            }
        )

    return {
        "mode": policy["mode"],
        "snapshotVersion": snapshot["snapshotVersion"],
        "summary": {
            "documentCount": len(documents_out),
            "claimCount": total_claims,
            "approvalRequiredClaimCount": total_claims,
            "autoAcceptedClaimCount": 0,
        },
        "evidence": documents_out,
    }


def to_source_snapshot(extraction: dict[str, Any]) -> dict[str, Any]:
    _require(isinstance(extraction, dict), "evidence extraction result must be an object")
    evidence = extraction.get("evidence")
    _require(isinstance(evidence, list), "evidence extraction result missing evidence")
    return {
        "snapshotVersion": extraction.get("snapshotVersion"),
        "evidence": copy.deepcopy(evidence),
    }


def merge_with_source_snapshot(
    source_snapshot: dict[str, Any] | None,
    extraction: dict[str, Any],
) -> dict[str, Any]:
    extracted = to_source_snapshot(extraction)
    if source_snapshot is None:
        return extracted

    merged = copy.deepcopy(source_snapshot)
    _require(
        merged.get("snapshotVersion") == extracted.get("snapshotVersion"),
        "source/evidence snapshotVersion mismatch",
    )
    existing = merged.get("evidence")
    if existing is None:
        existing_list: list[dict[str, Any]] = []
    elif isinstance(existing, list):
        existing_list = copy.deepcopy(existing)
    elif isinstance(existing, dict):
        existing_list = [copy.deepcopy(existing)]
    else:
        raise EvidenceExtractionError("source snapshot evidence must be an object or array")

    ids = {
        item.get("documentId")
        for item in existing_list
        if isinstance(item, dict)
    }
    for document in extracted["evidence"]:
        _require(
            document["documentId"] not in ids,
            f"duplicate evidence documentId across source snapshots: {document['documentId']}",
        )
        ids.add(document["documentId"])
        existing_list.append(copy.deepcopy(document))
    merged["evidence"] = existing_list
    return merged


def attach_evidence_extraction(
    plan: dict[str, Any],
    snapshot: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    result = copy.deepcopy(plan)
    result["evidenceExtraction"] = extract_evidence(snapshot, policy)
    return result
