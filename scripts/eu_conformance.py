#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_ACCESS = {"public", "public_identifier", "legitimate_interest", "authority_only"}
ALLOWED_VERIFY = {
    "UNVERIFIED",
    "SOURCE_CHECKED",
    "INDEPENDENTLY_VERIFIED",
    "REJECTED",
    "DEFERRED",
    "OPTIONAL_UNVERIFIED",
    "CONDITIONAL_UNVERIFIED",
    "REQUIRED_UNVERIFIED",
}
ALLOWED_CONFORMANCE = {"MAPPED_NOT_PROVEN", "PASS", "FAIL", "N/A"}

ACCESS_ROLES = {
    "public": {"anonymous", "public", "legitimate_interest", "responsible_operator", "authority"},
    "public_identifier": {"anonymous", "public", "legitimate_interest", "responsible_operator", "authority"},
    "legitimate_interest": {"legitimate_interest", "responsible_operator", "authority"},
    "authority_only": {"authority"},
}

LIFECYCLE_TRANSITIONS = {
    "ORIGINAL": {"REUSED", "REPURPOSED", "REMANUFACTURED", "WASTE"},
    "REUSED": {"REPURPOSED", "REMANUFACTURED", "WASTE"},
    "REPURPOSED": {"REMANUFACTURED", "WASTE"},
    "REMANUFACTURED": {"WASTE"},
    "WASTE": {"RECYCLED"},
    "RECYCLED": set(),
}

REGISTRY_TRANSITIONS = {
    "not_registered": {"submitted"},
    "submitted": {"registered", "rejected"},
    "registered": {"needs_update", "retired"},
    "rejected": {"submitted", "retired"},
    "needs_update": {"submitted", "retired"},
    "retired": set(),
}

MODEL_ONLY_SECTIONS = {
    "identification",
    "manufacturer",
    "category",
    "model_id",
    "place_of_manufacture",
    "rated_capacity_ah",
    "composition",
    "carbon_footprint",
    "responsible_sourcing",
    "recycled_content",
    "renewable_content_share",
    "voltage",
    "power_capability",
    "expected_lifetime",
    "storage_temperature",
    "warranty_calendar_life",
    "energy_efficiency",
    "internal_resistance",
    "c_rate_test",
    "markings",
    "eu_declaration_of_conformity",
    "waste_information",
    "restricted_composition",
    "spares",
    "disassembly",
    "safety_measures",
    "compliance_test_reports",
}

ITEM_ONLY_SECTIONS = {
    "unique_identifier",
    "performance_history",
    "state_of_health",
    "lifecycle_status",
    "usage",
    "telemetry",
}


class ConformanceError(ValueError):
    pass


def load_json(path: str | Path) -> dict[str, Any]:
    resolved = Path(path)
    if not resolved.is_absolute():
        resolved = ROOT / resolved
    return json.loads(resolved.read_text(encoding="utf-8"))


def validate_71_matrix(matrix: dict[str, Any]) -> dict[str, Any]:
    points = matrix.get("points")
    if not isinstance(points, list):
        raise ConformanceError("points must be a list")
    if len(points) != 71:
        raise ConformanceError(f"expected 71 points, got {len(points)}")

    numbers = [point.get("number") for point in points]
    if numbers != list(range(1, 72)):
        raise ConformanceError("point numbers must be exactly 1..71 in order")

    required_keys = {
        "number",
        "name",
        "legalSource",
        "canonicalFieldPath",
        "batteryCategoryApplicability",
        "applicabilityAt2027Launch",
        "accessClassNormalized",
        "sourceType",
        "evidenceRequirement",
        "provenanceRequired",
        "verificationState",
        "conformanceStatus",
    }

    errors: list[str] = []
    launch_required = 0
    provenance_required = 0

    for point in points:
        missing = sorted(required_keys - set(point))
        if missing:
            errors.append(f"point {point.get('number')}: missing {', '.join(missing)}")
            continue

        number = point["number"]
        if not str(point["legalSource"]).strip():
            errors.append(f"point {number}: legalSource is empty")
        if point["accessClassNormalized"] not in ALLOWED_ACCESS:
            errors.append(f"point {number}: invalid accessClassNormalized")
        if point["verificationState"] not in ALLOWED_VERIFY:
            errors.append(f"point {number}: invalid verificationState")
        if point["conformanceStatus"] not in ALLOWED_CONFORMANCE:
            errors.append(f"point {number}: invalid conformanceStatus")
        if "light_means_of_transport" not in point["batteryCategoryApplicability"]:
            errors.append(f"point {number}: LMT applicability missing")
        if point.get("effectiveAtLaunch") is True:
            launch_required += 1
            if point.get("effectiveDate") != "2027-02-18":
                errors.append(f"point {number}: launch-effective point needs 2027-02-18 effectiveDate")
        if point["provenanceRequired"]:
            provenance_required += 1
            if not str(point["evidenceRequirement"]).strip():
                errors.append(f"point {number}: provenance requires evidenceRequirement")
        if point["conformanceStatus"] == "PASS" and point["verificationState"] in {
            "UNVERIFIED",
            "OPTIONAL_UNVERIFIED",
            "CONDITIONAL_UNVERIFIED",
            "REQUIRED_UNVERIFIED",
        }:
            errors.append(f"point {number}: PASS cannot be paired with unverified evidence")

    if errors:
        raise ConformanceError("; ".join(errors))

    return {
        "total": len(points),
        "launchEffective": launch_required,
        "provenanceRequired": provenance_required,
        "status": "MATRIX_VALIDATED_NOT_EU_CERTIFIED",
    }


def validate_uid_bindings(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    uid_to_item: dict[str, str] = {}
    item_to_uid: dict[str, str] = {}
    count = 0

    for record in records:
        count += 1
        uid = str(record.get("unique_identifier") or "").strip()
        item_id = str(record.get("item_id") or "").strip()
        if not uid or not item_id:
            raise ConformanceError("each UID record needs unique_identifier and item_id")

        previous_item = uid_to_item.get(uid)
        if previous_item is not None and previous_item != item_id:
            raise ConformanceError(f"UID {uid} is bound to multiple batteries")

        previous_uid = item_to_uid.get(item_id)
        if previous_uid is not None and previous_uid != uid:
            raise ConformanceError(f"battery {item_id} changed immutable UID")

        uid_to_item[uid] = item_id
        item_to_uid[item_id] = uid

    return {"records": count, "uniqueUids": len(uid_to_item), "status": "UID_BINDINGS_VALID"}


def resolve_exact_passport(encoded_uid: str, passports_by_uid: dict[str, dict[str, Any]]) -> dict[str, Any]:
    uid = str(encoded_uid or "").strip()
    if not uid:
        raise ConformanceError("QR payload UID is empty")
    if uid not in passports_by_uid:
        raise ConformanceError("QR UID does not resolve to a passport")

    passport = passports_by_uid[uid]
    passport_uid = str(passport.get("unique_identifier") or "").strip()
    if passport_uid != uid:
        raise ConformanceError("resolver returned a passport for a different UID")
    return passport


def access_allowed(access_class: str, role: str) -> bool:
    if access_class not in ACCESS_ROLES:
        raise ConformanceError(f"unknown access class: {access_class}")
    return role in ACCESS_ROLES[access_class]


def validate_lifecycle_transition(
    previous: str,
    target: str,
    *,
    predecessor_passport_uid: str | None = None,
) -> dict[str, Any]:
    if previous not in LIFECYCLE_TRANSITIONS or target not in LIFECYCLE_TRANSITIONS:
        raise ConformanceError("unknown lifecycle state")
    if target not in LIFECYCLE_TRANSITIONS[previous]:
        raise ConformanceError(f"illegal lifecycle transition {previous} -> {target}")
    if target in {"REPURPOSED", "REMANUFACTURED"} and not str(predecessor_passport_uid or "").strip():
        raise ConformanceError(f"{target} requires an explicit predecessor passport link")
    return {
        "from": previous,
        "to": target,
        "predecessorLinked": bool(predecessor_passport_uid),
        "status": "TRANSITION_VALID",
    }



def assert_not_demo_uid(identifier: str) -> str:
    uid = str(identifier or "").strip()
    if not uid:
        raise ConformanceError("production UID is empty")
    if uid.lower().startswith("urn:dpp:demo:"):
        raise ConformanceError("demo UID namespace is forbidden in an EU production gate")
    return uid


def validate_model_item_separation(
    model_payload: dict[str, Any],
    item_payload: dict[str, Any],
) -> dict[str, Any]:
    model_item_keys = sorted(set(model_payload) & ITEM_ONLY_SECTIONS)
    item_model_keys = sorted(set(item_payload) & MODEL_ONLY_SECTIONS)
    if model_item_keys:
        raise ConformanceError(
            "model payload contains individual-battery fields: " + ", ".join(model_item_keys)
        )
    if item_model_keys:
        raise ConformanceError(
            "item payload contains model-level fields: " + ", ".join(item_model_keys)
        )
    return {
        "modelSections": len(model_payload),
        "itemSections": len(item_payload),
        "status": "MODEL_ITEM_SEPARATION_VALID",
    }


def transition_registry_state(
    current: str,
    target: str,
    *,
    submission_evidence: str | None = None,
    registry_receipt: str | None = None,
) -> dict[str, Any]:
    if current not in REGISTRY_TRANSITIONS or target not in REGISTRY_TRANSITIONS:
        raise ConformanceError("unknown registry state")
    if target not in REGISTRY_TRANSITIONS[current]:
        raise ConformanceError(f"illegal registry transition {current} -> {target}")
    if target == "submitted" and not str(submission_evidence or "").strip():
        raise ConformanceError("submitted requires submission evidence")
    if target == "registered" and not str(registry_receipt or "").strip():
        raise ConformanceError("registered requires registry receipt/proof")
    return {
        "from": current,
        "to": target,
        "submissionEvidence": bool(submission_evidence),
        "registryReceipt": bool(registry_receipt),
        "status": "REGISTRY_TRANSITION_VALID",
    }


def validate_harmonised_standards_inventory(inventory: dict[str, Any]) -> dict[str, Any]:
    expected = {
        "EN-18216:2026",
        "EN-18219:2026",
        "EN-18220:2026",
        "EN-18221:2026",
        "EN-18222:2026",
        "EN-18223:2026",
    }
    standards = inventory.get("standards") or []
    ids = {row.get("id") for row in standards}
    if ids != expected:
        raise ConformanceError("harmonised DPP standards inventory is incomplete or unexpected")

    for row in standards:
        if row.get("ojReferencePublished") is not True:
            raise ConformanceError(f"{row.get('id')}: OJ reference flag missing")
        if row.get("clauseReviewStatus") == "PASS":
            raise ConformanceError(f"{row.get('id')}: title/reference alone cannot prove clause conformance")
        if row.get("conformanceStatus") == "PASS":
            raise ConformanceError(f"{row.get('id')}: licensed clause review evidence is required before PASS")

    return {"count": len(standards), "status": "REFERENCES_LOCKED_CLAUSE_REVIEW_PENDING"}


def evaluate_final_gate(evidence: dict[str, Any]) -> str:
    technical = bool(evidence.get("technical_tests_passed"))
    if not technical:
        return "NOT_READY"

    pilot_requirements = (
        bool(evidence.get("real_manufacturer_dataset"))
        and bool(evidence.get("physical_qr_scan"))
        and bool(evidence.get("customer_uat"))
    )
    if not pilot_requirements:
        return "TECHNICALLY_READY"

    eu_requirements = (
        bool(evidence.get("all_applicable_points_evidenced"))
        and bool(evidence.get("licensed_en_clause_review_complete"))
        and bool(evidence.get("registry_proof"))
        and bool(evidence.get("legal_compliance_review"))
        and bool(evidence.get("provenance_complete"))
    )
    if eu_requirements:
        return "EU_CONFORMANCE_EVIDENCE_COMPLETE"
    return "PILOT_EVIDENCE_COMPLETE"


def run_repository_gate() -> dict[str, Any]:
    matrix = load_json("data/lmt-battery-71-eu-conformance-v1.json")
    standards = load_json("data/eu-dpp-harmonised-standards-v1.json")
    matrix_result = validate_71_matrix(matrix)
    standards_result = validate_harmonised_standards_inventory(standards)
    return {
        "matrix": matrix_result,
        "standards": standards_result,
        "claim": "TECHNICAL_TRACEABILITY_GATE_ONLY_NOT_EU_CERTIFICATION",
    }


if __name__ == "__main__":
    print(json.dumps(run_repository_gate(), indent=2, sort_keys=True))
