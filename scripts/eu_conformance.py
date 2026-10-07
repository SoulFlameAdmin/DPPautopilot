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

EVIDENCE_STATUS_BY_APPLICABILITY = {
    "mandatory": {"MISSING", "EVIDENCED", "VERIFIED", "REJECTED"},
    "if_applicable": {
        "CONDITIONAL_PENDING",
        "NOT_APPLICABLE_WITH_BASIS",
        "EVIDENCED",
        "VERIFIED",
        "REJECTED",
    },
    "optional": {"OPTIONAL_PENDING", "EVIDENCED", "VERIFIED", "REJECTED"},
    "not_required_2027": {"DEFERRED_2027", "EVIDENCED", "VERIFIED", "REJECTED"},
}
EXTERNAL_EVIDENCE_STATUS = {"MISSING", "EVIDENCED", "VERIFIED", "REJECTED"}
EU_EXTERNAL_SECTIONS = {
    "company",
    "responsible_economic_operator",
    "unique_identifier",
    "qr_resolution",
    "registry_proof",
    "physical_qr_scan",
    "uat_evidence",
    "licensed_en_clause_review",
    "legal_compliance_review",
}
REGISTRY_STATES = {
    "not_registered",
    "submitted",
    "registered",
    "rejected",
    "needs_update",
    "retired",
}

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



def validate_evidence_pack(pack: dict[str, Any], matrix: dict[str, Any]) -> dict[str, Any]:
    rows = pack.get("pointEvidence")
    if not isinstance(rows, list) or len(rows) != 71:
        raise ConformanceError("evidence pack must contain exactly 71 pointEvidence rows")
    if [row.get("number") for row in rows] != list(range(1, 72)):
        raise ConformanceError("evidence pack point numbers must be exactly 1..71 in order")

    matrix_rows = {row["number"]: row for row in matrix.get("points") or []}
    if len(matrix_rows) != 71:
        raise ConformanceError("source matrix is not a valid 71-point matrix")

    mandatory_missing = 0
    mandatory_evidenced_not_verified = 0
    conditional_unassessed = 0
    conditional_evidenced_not_verified = 0
    verified_points = 0

    for row in rows:
        number = row["number"]
        source = matrix_rows[number]
        for key in ("legalSource", "canonicalFieldPath", "applicabilityAt2027Launch"):
            if row.get(key) != source.get(key):
                raise ConformanceError(f"point {number}: evidence pack drift in {key}")

        applicability = row["applicabilityAt2027Launch"]
        status = row.get("evidenceStatus")
        allowed = EVIDENCE_STATUS_BY_APPLICABILITY.get(applicability)
        if allowed is None or status not in allowed:
            raise ConformanceError(f"point {number}: invalid evidenceStatus for {applicability}")

        evidence_ids = row.get("evidenceIds")
        provenance_refs = row.get("provenanceRefs")
        if not isinstance(evidence_ids, list) or not isinstance(provenance_refs, list):
            raise ConformanceError(f"point {number}: evidenceIds/provenanceRefs must be arrays")

        if status in {"EVIDENCED", "VERIFIED"}:
            if not evidence_ids:
                raise ConformanceError(f"point {number}: {status} requires evidenceIds")
            if source.get("provenanceRequired") and not provenance_refs:
                raise ConformanceError(f"point {number}: {status} requires provenanceRefs")
        if status == "VERIFIED":
            if not str(row.get("verificationRef") or "").strip():
                raise ConformanceError(f"point {number}: VERIFIED requires verificationRef")
            verified_points += 1

        if applicability == "mandatory":
            if status == "MISSING":
                mandatory_missing += 1
            elif status == "EVIDENCED":
                mandatory_evidenced_not_verified += 1
            elif status == "REJECTED":
                mandatory_missing += 1
        elif applicability == "if_applicable":
            if status == "CONDITIONAL_PENDING":
                conditional_unassessed += 1
            elif status == "EVIDENCED":
                conditional_evidenced_not_verified += 1
            elif status == "REJECTED":
                conditional_unassessed += 1
            elif status == "NOT_APPLICABLE_WITH_BASIS":
                if not str(row.get("notes") or "").strip():
                    raise ConformanceError(
                        f"point {number}: NOT_APPLICABLE_WITH_BASIS requires notes/basis"
                    )

    external = pack.get("externalSections")
    if not isinstance(external, list):
        raise ConformanceError("externalSections must be an array")
    external_by_id = {row.get("id"): row for row in external if isinstance(row, dict)}
    if set(external_by_id) != EU_EXTERNAL_SECTIONS:
        raise ConformanceError("externalSections do not match the EU evidence contract")

    external_unverified = 0
    for section_id in sorted(EU_EXTERNAL_SECTIONS):
        row = external_by_id[section_id]
        status = row.get("status")
        if status not in EXTERNAL_EVIDENCE_STATUS:
            raise ConformanceError(f"external section {section_id}: invalid status")
        refs = row.get("evidenceRefs")
        if not isinstance(refs, list):
            raise ConformanceError(f"external section {section_id}: evidenceRefs must be an array")
        if status in {"EVIDENCED", "VERIFIED"} and not refs:
            raise ConformanceError(f"external section {section_id}: {status} requires evidenceRefs")
        if status != "VERIFIED":
            external_unverified += 1

    if mandatory_missing or conditional_unassessed:
        readiness = "EVIDENCE_COLLECTION_REQUIRED"
    elif mandatory_evidenced_not_verified or conditional_evidenced_not_verified or external_unverified:
        readiness = "VERIFICATION_REQUIRED"
    else:
        readiness = "EVIDENCE_PACK_READY_FOR_FINAL_GATE"

    return {
        "total": 71,
        "verifiedPoints": verified_points,
        "mandatoryMissing": mandatory_missing,
        "mandatoryEvidencedNotVerified": mandatory_evidenced_not_verified,
        "conditionalUnassessed": conditional_unassessed,
        "conditionalEvidencedNotVerified": conditional_evidenced_not_verified,
        "externalUnverified": external_unverified,
        "readiness": readiness,
    }


def validate_registry_adapter_contract(adapter: dict[str, Any]) -> dict[str, Any]:
    if adapter.get("mode") != "provider_neutral_no_network_submission":
        raise ConformanceError("unexpected Registry adapter mode")
    facts = adapter.get("operationalFacts") or {}
    if facts.get("registryOperationalSince") != "2026-07-20":
        raise ConformanceError("Registry operational date is missing or unexpected")
    if facts.get("testingEnvironmentAvailable") is not True:
        raise ConformanceError("Registry testing environment must be represented")
    if "unique_identifier" not in (facts.get("storesAtLeast") or []):
        raise ConformanceError("Registry contract must store at least unique_identifier")
    if "unique_registration_identifier" not in (facts.get("returnsAfterUpload") or []):
        raise ConformanceError("Registry contract must model unique_registration_identifier")
    if facts.get("registrationIdentifierIsComplianceProof") is not False:
        raise ConformanceError("Registry registration identifier must not be treated as compliance proof")

    states = set(adapter.get("states") or [])
    if states != REGISTRY_STATES:
        raise ConformanceError("Registry adapter states are incomplete")

    response = adapter.get("responseContract") or {}
    registered_requires = set(response.get("registeredRequires") or [])
    if {"unique_registration_identifier", "receipt_reference"} - registered_requires:
        raise ConformanceError("registered response contract is incomplete")

    transport = adapter.get("transport") or {}
    if transport.get("networkSubmissionEnabled") is not False:
        raise ConformanceError("network Registry submission must remain disabled in repo-only adapter")

    return {
        "states": len(states),
        "operationalSince": facts["registryOperationalSince"],
        "testingEnvironmentAvailable": True,
        "status": "REGISTRY_ADAPTER_CONTRACT_VALID",
    }


def _reject_registry_secret_fields(value: Any, path: str = "request") -> None:
    secret_keys = {
        "authorization",
        "access_token",
        "refresh_token",
        "api_key",
        "apikey",
        "client_secret",
        "password",
        "service_role_key",
    }
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).strip().lower() in secret_keys:
                raise ConformanceError(f"{path} contains forbidden credential field {key}")
            _reject_registry_secret_fields(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_registry_secret_fields(child, f"{path}[{index}]")


def build_registry_upload_request(
    unique_identifier: str,
    additional_registry_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    uid = assert_not_demo_uid(unique_identifier)
    additional = {} if additional_registry_data is None else additional_registry_data
    if not isinstance(additional, dict):
        raise ConformanceError("additional_registry_data must be an object")
    _reject_registry_secret_fields(additional)
    return {
        "unique_identifier": uid,
        "additional_registry_data": additional,
        "networkSubmissionAllowed": False,
        "state": "not_registered",
    }


def record_registry_registration(
    request: dict[str, Any],
    response: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(request, dict) or not isinstance(response, dict):
        raise ConformanceError("Registry request/response must be objects")
    uid = assert_not_demo_uid(request.get("unique_identifier"))
    registration_id = str(response.get("unique_registration_identifier") or "").strip()
    receipt_reference = str(response.get("receipt_reference") or "").strip()
    if not registration_id:
        raise ConformanceError("Registry response requires unique_registration_identifier")
    if not receipt_reference:
        raise ConformanceError("Registry response requires receipt_reference")
    return {
        "state": "registered",
        "unique_identifier": uid,
        "unique_registration_identifier": registration_id,
        "receipt_reference": receipt_reference,
        "registryEvidenceComplete": True,
        "complianceProven": False,
    }


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
    evidence_pack = load_json("data/eu-dpp-evidence-pack-template-v1.json")
    registry_adapter = load_json("data/eu-dpp-registry-adapter-v1.json")
    matrix_result = validate_71_matrix(matrix)
    standards_result = validate_harmonised_standards_inventory(standards)
    evidence_result = validate_evidence_pack(evidence_pack, matrix)
    registry_result = validate_registry_adapter_contract(registry_adapter)
    return {
        "matrix": matrix_result,
        "standards": standards_result,
        "evidencePack": evidence_result,
        "registryAdapter": registry_result,
        "claim": "TECHNICAL_TRACEABILITY_GATE_ONLY_NOT_EU_CERTIFICATION",
    }


if __name__ == "__main__":
    print(json.dumps(run_repository_gate(), indent=2, sort_keys=True))
