#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def get_path(obj, dotted: str):
    current = obj
    for part in dotted.split('.'):
        if not isinstance(current, dict) or part not in current:
            return None, False
        current = current[part]
    return current, True


def type_ok(value, kind: str) -> bool:
    if kind in {"string", "month", "enum", "document_ref"}:
        return isinstance(value, str) and bool(value.strip())
    if kind in {"number"}:
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind in {"array", "document_ref_array"}:
        return isinstance(value, list)
    if kind == "object":
        return isinstance(value, dict)
    return value is not None


def main() -> None:
    catalog = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
    fixture = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))

    require(fixture.get("synthetic") is True, "fixture must be explicitly synthetic")
    disclaimer = str(fixture.get("disclaimer", "")).lower()
    require("synthetic" in disclaimer and "not" in disclaimer, "fixture needs a clear synthetic/non-real disclaimer")
    require(isinstance(fixture.get("model"), dict), "fixture.model must exist")
    items = fixture.get("items")
    require(isinstance(items, list) and len(items) >= 2, "fixture must contain at least two demo battery items")

    checked_model = 0
    checked_item = 0
    for field in catalog.get("fields", []):
        path = field["path"]
        kind = field["type"]
        required = field.get("required")
        if path.startswith("model."):
            value, exists = get_path(fixture, path)
            if required is True or str(required).startswith("conditional"):
                require(exists, f"required model fixture field missing: {path}")
                require(type_ok(value, kind), f"wrong type for {path}: expected {kind}")
            if exists:
                checked_model += 1
        elif path.startswith("item."):
            relative = path.removeprefix("item.")
            for index, item in enumerate(items):
                value, exists = get_path(item, relative)
                require(exists, f"item[{index}] required field missing: {path}")
                require(type_ok(value, kind), f"item[{index}] wrong type for {path}: expected {kind}")
            checked_item += 1

    identifiers = [item.get("unique_identifier") for item in items]
    require(all(isinstance(x, str) and x.startswith("urn:dpp:demo:") for x in identifiers), "demo item identifiers must be explicit demo URNs")
    require(len(set(identifiers)) == len(identifiers), "demo item identifiers must be unique")

    serialized = json.dumps(fixture, ensure_ascii=False).lower()
    require("example.invalid" in serialized, "synthetic contact domains must use .invalid")
    require("synthetic" in serialized, "fixture values must visibly identify synthetic content")

    print(
        "SAMPLE_FIXTURE_PASS: "
        f"synthetic fixture validated; {checked_model} model catalog fields and "
        f"{checked_item} item field groups covered across {len(items)} items"
    )


if __name__ == "__main__":
    main()
