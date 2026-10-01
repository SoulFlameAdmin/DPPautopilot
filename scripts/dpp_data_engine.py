"""Catalog-driven DPP field event validation/materialization.

Battery Platform V3 precursor:
- field definitions come from data/dpp-field-catalog.json;
- every event carries source, source_date, access_level and verification_status;
- history is append-only at the API/module level (DB trigger enforces this in Postgres);
- no passport values are embedded in this module.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "dpp-field-catalog.json"
SOURCE_KINDS = {"manual", "csv", "xlsx", "api", "bms", "derived", "migration"}
VERIFY_STATES = {"unverified", "validated", "verified", "rejected"}


def load_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def catalog_index(catalog: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    catalog = catalog or load_catalog()
    return {entry["path"]: entry for entry in catalog["fields"]}


def _parse_timestamp(value: str, name: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required")
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"{name} must be ISO-8601") from exc


def validate_field_event(event: dict[str, Any], catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    idx = catalog_index(catalog)
    required = {
        "event_id", "organization_id", "subject_kind", "subject_id", "field_path",
        "value", "source_kind", "source_ref", "source_date", "access_level",
        "verification_status", "recorded_at"
    }
    missing = sorted(k for k in required if k not in event)
    if missing:
        raise ValueError("missing event keys: " + ", ".join(missing))

    field_path = event["field_path"]
    if field_path not in idx:
        raise ValueError(f"unknown canonical field_path: {field_path}")

    if event["subject_kind"] not in {"model", "item", "passport"}:
        raise ValueError("invalid subject_kind")
    if event["source_kind"] not in SOURCE_KINDS:
        raise ValueError("invalid source_kind")
    if not isinstance(event["source_ref"], str) or not event["source_ref"].strip():
        raise ValueError("source_ref is required")
    _parse_timestamp(event["source_date"], "source_date")
    _parse_timestamp(event["recorded_at"], "recorded_at")

    expected_access = idx[field_path]["access"]
    if event["access_level"] != expected_access:
        raise ValueError(
            f"access_level mismatch for {field_path}: "
            f"{event['access_level']} != {expected_access}"
        )
    if event["verification_status"] not in VERIFY_STATES:
        raise ValueError("invalid verification_status")
    if event.get("supersedes_id") == event["event_id"]:
        raise ValueError("event cannot supersede itself")

    return deepcopy(event)


def append_event(history: Iterable[dict[str, Any]], event: dict[str, Any],
                 catalog: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    validated = validate_field_event(event, catalog)
    current = [deepcopy(x) for x in history]
    if any(x.get("event_id") == validated["event_id"] for x in current):
        raise ValueError("duplicate event_id")
    current.append(validated)
    return current


def latest_projection(history: Iterable[dict[str, Any]],
                      catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    latest: dict[tuple[str, str, str], tuple[datetime, str, Any]] = {}
    for raw in history:
        event = validate_field_event(raw, catalog)
        key = (event["subject_kind"], event["subject_id"], event["field_path"])
        stamp = _parse_timestamp(event["recorded_at"], "recorded_at")
        candidate = (stamp, str(event["event_id"]), deepcopy(event["value"]))
        if key not in latest or candidate[:2] > latest[key][:2]:
            latest[key] = candidate
    return {"|".join(k): v[2] for k, v in latest.items()}
