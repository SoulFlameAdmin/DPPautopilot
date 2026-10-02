#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class MissingField:
    path: str
    source: str
    ui_target: str


def get_path(obj: Any, path: str) -> Any:
    cur = obj
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def is_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return True
    return True


def _condition_value(fixture: dict, item: dict, path: str) -> Any:
    if path.startswith("model."):
        return get_path(fixture, path)
    if path.startswith("item."):
        return get_path(item, path.removeprefix("item."))
    return get_path(fixture, path)


def field_is_applicable(field: dict, fixture: dict, item: dict) -> bool:
    applicability = field.get("applicability")
    if not isinstance(applicability, dict):
        return field.get("required") is True
    mode = applicability.get("mode")
    if mode == "always":
        return True
    if mode == "optional":
        return False
    if mode != "when":
        raise ValueError(f"invalid applicability mode for {field.get('path')}: {mode}")

    for condition in applicability.get("all") or []:
        actual = _condition_value(fixture, item, condition["path"])
        operator = condition["operator"]
        if operator == "equals":
            if actual != condition.get("value"):
                return False
        elif operator == "in":
            if actual not in condition.get("values", []):
                return False
        else:
            raise ValueError(f"unsupported applicability operator: {operator}")
    return True


def required_fields(catalog: dict, fixture: dict | None = None, item: dict | None = None) -> list[dict]:
    if fixture is None:
        return [field for field in catalog.get("fields", []) if field.get("required") is True]
    return [
        field for field in catalog.get("fields", [])
        if field_is_applicable(field, fixture, item or {})
    ]


def score_fixture(catalog: dict, fixture: dict, item_index: int = 0) -> dict:
    items = fixture.get("items") or []
    item = items[item_index] if len(items) > item_index else {}
    required = required_fields(catalog, fixture, item)
    missing: list[MissingField] = []
    present = 0

    for field in required:
        path = field["path"]
        if path.startswith("model."):
            value = get_path(fixture, path)
        elif path.startswith("item."):
            value = get_path(item, path.removeprefix("item."))
        else:
            value = None

        if is_present(value):
            present += 1
        else:
            missing.append(MissingField(
                path=path,
                source=field.get("source", ""),
                ui_target=field.get("uiTarget", ""),
            ))

    total = len(required)
    percent = round((present / total) * 100, 1) if total else 100.0
    return {
        "required": total,
        "present": present,
        "missingCount": len(missing),
        "score": percent,
        "missing": [m.__dict__ for m in missing],
    }
