#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "dpp-field-catalog.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    fields = data.get("fields")
    require(isinstance(fields, list) and fields, "catalog.fields must be a non-empty list")

    paths: set[str] = set()
    requirement_ids: set[str] = set()
    allowed_access = {"public", "public_identifier", "legitimate_interest", "authority_only"}

    for field in fields:
        path = field.get("path")
        require(isinstance(path, str) and path, "every field requires path")
        require(path not in paths, f"duplicate field path: {path}")
        paths.add(path)

        reqs = field.get("requirementIds")
        require(isinstance(reqs, list) and reqs, f"{path} requires requirementIds")
        requirement_ids.update(reqs)
        require(field.get("source"), f"{path} requires source")
        require(field.get("access") in allowed_access, f"{path} has invalid access class")
        require(field.get("type"), f"{path} requires type")
        require("required" in field, f"{path} requires required/conditional declaration")

        applicability = field.get("applicability")
        require(isinstance(applicability, dict), f"{path} requires machine-readable applicability")
        mode = applicability.get("mode")
        require(mode in {"always", "optional", "when"}, f"{path} has invalid applicability mode")
        if mode == "when":
            conditions = applicability.get("all")
            require(isinstance(conditions, list) and conditions, f"{path} conditional applicability requires all[]")
            for condition in conditions:
                require(isinstance(condition, dict), f"{path} applicability condition must be an object")
                require(isinstance(condition.get("path"), str) and condition["path"], f"{path} condition requires path")
                require(condition.get("operator") in {"equals", "in"}, f"{path} has invalid condition operator")
                if condition.get("operator") == "equals":
                    require("value" in condition, f"{path} equals condition requires value")
                else:
                    require(isinstance(condition.get("values"), list) and condition["values"], f"{path} in condition requires values")
        for target in ("dbTarget", "apiTarget", "uiTarget"):
            require(field.get(target), f"{path} requires {target}")

    expected_annex_vi = {f"A6-{i:03d}" for i in range(1, 11)}
    expected_public = {f"PUB-{i:03d}" for i in range(1, 22)}
    expected_limited = {f"LIM-{i:03d}" for i in range(1, 10)}
    expected_items = {f"ITEM-{i:03d}" for i in range(1, 8)}
    expected_authority = {"AUTH-001"}

    for label, expected in {
        "Annex VI Part A": expected_annex_vi,
        "Annex XIII public": expected_public,
        "Annex XIII legitimate-interest": expected_limited,
        "Annex XIII item": expected_items,
        "Annex XIII authority": expected_authority,
    }.items():
        missing = sorted(expected - requirement_ids)
        require(not missing, f"{label} requirement coverage missing: {missing}")

    require(
        data.get("pendingRegulatoryItems"),
        "catalog must explicitly track pending regulatory items rather than assuming future rules",
    )

    print(
        "FIELD_CATALOG_PASS: "
        f"{len(fields)} implementation fields; {len(requirement_ids)} requirement IDs covered"
    )


if __name__ == "__main__":
    main()
