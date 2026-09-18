#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "dpp-field-catalog.json"
POLICY_PATH = ROOT / "data" / "access-class-policy.json"


def load_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def load_policy() -> dict[str, Any]:
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def get_path(obj: Any, path: str) -> Any:
    cur = obj
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def validate_access_catalog(catalog: dict[str, Any] | None = None, policy: dict[str, Any] | None = None) -> dict[str, int]:
    catalog = catalog or load_catalog()
    policy = policy or load_policy()
    allowed = set(policy["allowed_classes"])
    counts: dict[str, int] = {name: 0 for name in allowed}

    fields = catalog.get("fields", [])
    if not fields:
        raise ValueError("field catalog is empty")

    for field in fields:
        access = field.get("access")
        if access not in allowed:
            raise ValueError(f"field {field.get('path')} has invalid access class: {access!r}")
        counts[access] += 1

    return counts


def project_public_passport(
    fixture: dict[str, Any],
    item_index: int = 0,
    catalog: dict[str, Any] | None = None,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    catalog = catalog or load_catalog()
    policy = policy or load_policy()
    public_classes = set(policy["public_projection_classes"])
    restricted_classes = set(policy["restricted_projection_classes"])

    if public_classes & restricted_classes:
        raise ValueError("public and restricted access classes overlap")

    items = fixture.get("items") or []
    if item_index < 0 or item_index >= len(items):
        raise IndexError("battery item index is out of range")
    item = items[item_index]

    projected: list[dict[str, Any]] = []
    for field in catalog.get("fields", []):
        access = field.get("access")
        if access not in public_classes:
            continue

        path = field["path"]
        if path.startswith("model."):
            value = get_path(fixture, path)
        elif path.startswith("item."):
            value = get_path(item, path.removeprefix("item."))
        else:
            value = None

        if value is None:
            continue

        projected.append({
            "path": path,
            "access": access,
            "api_target": field.get("apiTarget"),
            "value": value,
        })

    return {
        "item_identifier": item.get("unique_identifier"),
        "field_count": len(projected),
        "fields": projected,
    }
