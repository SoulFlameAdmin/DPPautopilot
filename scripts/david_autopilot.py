#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from completeness import score_fixture  # noqa: E402
from david_source_adapters import attach_source_candidates  # noqa: E402
from david_supplier_queue import attach_supplier_queue  # noqa: E402


class AutopilotPolicyError(ValueError):
    pass


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise AutopilotPolicyError(message)


def validate_policy(policy: dict[str, Any]) -> None:
    _require(policy.get("version"), "policy version missing")
    _require(policy.get("mode") == "advisory_with_safe_local_automation", "unexpected autopilot mode")
    rules = policy.get("sourceRules")
    _require(isinstance(rules, list) and rules, "sourceRules must be a non-empty list")
    for index, rule in enumerate(rules):
        for key in ("prefix", "source", "action", "executionMode", "approvalRequired", "priority"):
            _require(key in rule, f"sourceRules[{index}] missing {key}")
        _require(rule["executionMode"] in {"auto_local", "propose"}, f"invalid executionMode in rule {index}")
        _require(isinstance(rule["approvalRequired"], bool), f"approvalRequired must be boolean in rule {index}")
        _require(isinstance(rule["priority"], int) and rule["priority"] >= 0, f"priority must be non-negative int in rule {index}")

    default = policy.get("defaultRule") or {}
    for key in ("source", "action", "executionMode", "approvalRequired", "priority"):
        _require(key in default, f"defaultRule missing {key}")

    safety = policy.get("safety") or {}
    _require(safety.get("allowExternalSideEffects") is False, "MVP must fail closed on external side effects")
    _require(safety.get("allowUnsupportedComplianceClaims") is False, "MVP must forbid unsupported compliance claims")
    _require(safety.get("requireCatalogEvidence") is True, "catalog evidence must be required")
    _require(safety.get("requireDeterministicPlan") is True, "deterministic plan must be required")


def _best_rule(path: str, policy: dict[str, Any]) -> dict[str, Any]:
    matches = [rule for rule in policy["sourceRules"] if path.startswith(rule["prefix"])]
    if not matches:
        return dict(policy["defaultRule"])
    return dict(max(matches, key=lambda rule: len(rule["prefix"])))


def _catalog_index(catalog: dict[str, Any]) -> dict[str, dict[str, Any]]:
    fields = catalog.get("fields") or []
    index: dict[str, dict[str, Any]] = {}
    for field in fields:
        path = field.get("path")
        if isinstance(path, str) and path:
            index[path] = field
    return index


def _action_id(path: str, action: str) -> str:
    digest = hashlib.sha256(f"{path}|{action}".encode("utf-8")).hexdigest()[:12]
    return f"david-{digest}"


def build_plan(
    catalog: dict[str, Any],
    fixture: dict[str, Any],
    policy: dict[str, Any],
    item_index: int = 0,
) -> dict[str, Any]:
    validate_policy(policy)
    completeness = score_fixture(catalog, fixture, item_index=item_index)
    fields = _catalog_index(catalog)
    actions: list[dict[str, Any]] = []

    for missing in completeness["missing"]:
        path = missing["path"]
        field = fields.get(path)
        if field is None:
            raise AutopilotPolicyError(f"missing catalog evidence for {path}")

        rule = _best_rule(path, policy)
        approval_required = bool(rule["approvalRequired"])
        execution_mode = rule["executionMode"]

        # Fail closed: proposed/external work is never represented as already executed.
        state = "approval_required" if approval_required else "ready_for_safe_local_automation"
        actions.append(
            {
                "id": _action_id(path, rule["action"]),
                "fieldPath": path,
                "action": rule["action"],
                "source": rule["source"],
                "priority": int(rule["priority"]),
                "executionMode": execution_mode,
                "approvalRequired": approval_required,
                "state": state,
                "evidence": {
                    "regulatorySource": field.get("source", ""),
                    "requirementIds": field.get("requirementIds", []),
                    "accessClass": field.get("access", ""),
                    "uiTarget": field.get("uiTarget", ""),
                    "apiTarget": field.get("apiTarget", ""),
                    "dbTarget": field.get("dbTarget", ""),
                },
            }
        )

    actions.sort(key=lambda action: (action["priority"], action["fieldPath"], action["id"]))
    next_action = actions[0] if actions else None
    auto_count = sum(1 for action in actions if not action["approvalRequired"])
    approval_count = len(actions) - auto_count

    return {
        "planner": "DAVID_DPP_AUTOPILOT",
        "plannerVersion": policy["version"],
        "mode": policy["mode"],
        "status": "complete" if not actions else "action_required",
        "itemIndex": item_index,
        "completeness": completeness,
        "summary": {
            "actionCount": len(actions),
            "safeLocalAutomationCount": auto_count,
            "approvalRequiredCount": approval_count,
            "externalSideEffectsAllowed": False,
        },
        "nextAction": next_action,
        "actions": actions,
    }


def load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise AutopilotPolicyError(f"{path} must contain a JSON object")
    return data




SENSITIVE_SNAPSHOT_KEYS = {
    "authorization",
    "access_token",
    "refresh_token",
    "service_role_key",
    "apikey",
    "api_key",
}


def _reject_snapshot_secrets(value: Any, path: str = "snapshot") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower()
            _require(normalized not in SENSITIVE_SNAPSHOT_KEYS, f"{path} contains forbidden credential field {key}")
            _reject_snapshot_secrets(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_snapshot_secrets(child, f"{path}[{index}]")


def _unwrap_api_data(snapshot: dict[str, Any], key: str, *, required: bool) -> Any:
    if key not in snapshot:
        if required:
            raise AutopilotPolicyError(f"API snapshot missing {key}")
        return None
    value = snapshot[key]
    if isinstance(value, dict) and "error" in value:
        raise AutopilotPolicyError(f"API snapshot {key} contains an error response")
    if isinstance(value, dict) and "data" in value:
        value = value["data"]
    return value


def _select_row(rows: Any, *, kind: str, row_id: str | None, index: int, sort_keys: tuple[str, ...]) -> dict[str, Any]:
    _require(isinstance(rows, list), f"API snapshot {kind} data must be an array")
    _require(rows, f"API snapshot {kind} data must not be empty")
    _require(all(isinstance(row, dict) for row in rows), f"API snapshot {kind} rows must be objects")

    if row_id is not None:
        matches = [row for row in rows if row.get("id") == row_id]
        _require(len(matches) == 1, f"API snapshot {kind} id not found or ambiguous: {row_id}")
        return matches[0]

    ordered = sorted(
        rows,
        key=lambda row: tuple(str(row.get(key) or "") for key in sort_keys) + (str(row.get("id") or ""),),
    )
    _require(0 <= index < len(ordered), f"API snapshot {kind} index out of range")
    return ordered[index]


def _canonical_subtree(row: dict[str, Any], root_key: str) -> dict[str, Any]:
    canonical = row.get("canonical_data")
    _require(isinstance(canonical, dict), f"API snapshot {root_key} canonical_data must be an object")
    nested = canonical.get(root_key)
    if nested is not None:
        _require(isinstance(nested, dict), f"API snapshot canonical_data.{root_key} must be an object")
        return copy.deepcopy(nested)
    return copy.deepcopy(canonical)


def _setdefault_path(target: dict[str, Any], path: tuple[str, ...], value: Any) -> None:
    if value is None:
        return
    cur = target
    for part in path[:-1]:
        existing = cur.get(part)
        if existing is None:
            existing = {}
            cur[part] = existing
        _require(isinstance(existing, dict), f"API snapshot cannot map {'.'.join(path)} into non-object data")
        cur = existing
    cur.setdefault(path[-1], value)


def _optional_import_snapshot(snapshot: dict[str, Any]) -> dict[str, Any] | None:
    key = "import" if "import" in snapshot else "imports" if "imports" in snapshot else None
    if key is None:
        return None
    value = _unwrap_api_data(snapshot, key, required=False)
    if value is None:
        return None
    if isinstance(value, list):
        _require(all(isinstance(row, dict) for row in value), "API snapshot imports rows must be objects")
        if not value:
            return None
        value = sorted(
            value,
            key=lambda row: (
                str(row.get("created_at") or ""),
                str(row.get("import_id") or row.get("id") or ""),
            ),
        )[-1]
    _require(isinstance(value, dict), "API snapshot import data must be an object or array")
    return value


def fixture_from_api_snapshot(
    snapshot: dict[str, Any],
    *,
    item_index: int = 0,
    model_id: str | None = None,
    item_id: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    _require(isinstance(snapshot, dict), "API snapshot must be a JSON object")
    _reject_snapshot_secrets(snapshot)

    models = _unwrap_api_data(snapshot, "models", required=True)
    items = _unwrap_api_data(snapshot, "items", required=True)
    selected_item = _select_row(
        items,
        kind="items",
        row_id=item_id,
        index=item_index,
        sort_keys=("unique_identifier",),
    )

    linked_model_id = selected_item.get("model_id")
    selected_model_id = model_id or linked_model_id
    _require(isinstance(selected_model_id, str) and selected_model_id, "selected item is missing model_id")
    if model_id is not None:
        _require(linked_model_id == model_id, "selected item model_id does not match requested model_id")

    selected_model = _select_row(
        models,
        kind="models",
        row_id=selected_model_id,
        index=0,
        sort_keys=("model_identifier",),
    )
    _require(selected_item.get("model_id") == selected_model.get("id"), "selected item is not linked to selected model")

    model = _canonical_subtree(selected_model, "model")
    item = _canonical_subtree(selected_item, "item")

    _setdefault_path(model, ("identification", "model_id"), selected_model.get("model_identifier"))
    _setdefault_path(model, ("identification", "manufacturer", "name"), selected_model.get("manufacturer_name"))
    _setdefault_path(model, ("identification", "category"), selected_model.get("category"))
    _setdefault_path(item, ("unique_identifier",), selected_item.get("unique_identifier"))
    _setdefault_path(item, ("lifecycle_status",), selected_item.get("lifecycle_status"))

    import_row = _optional_import_snapshot(snapshot)
    provenance = {
        "kind": "authenticated_api_snapshot",
        "modelId": selected_model.get("id"),
        "itemId": selected_item.get("id"),
        "importId": None if import_row is None else import_row.get("import_id", import_row.get("id")),
        "importStatus": None if import_row is None else import_row.get("status"),
    }
    return {"model": model, "items": [item]}, provenance


def build_plan_from_api_snapshot(
    catalog: dict[str, Any],
    snapshot: dict[str, Any],
    policy: dict[str, Any],
    *,
    item_index: int = 0,
    model_id: str | None = None,
    item_id: str | None = None,
) -> dict[str, Any]:
    fixture, provenance = fixture_from_api_snapshot(
        snapshot,
        item_index=item_index,
        model_id=model_id,
        item_id=item_id,
    )
    plan = build_plan(catalog, fixture, policy, item_index=0)
    plan["input"] = provenance
    return plan


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a deterministic DAVID DPP Autopilot action plan.")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--fixture", type=Path)
    source.add_argument("--api-snapshot", type=Path)
    parser.add_argument("--catalog", type=Path, default=ROOT / "data/dpp-field-catalog.json")
    parser.add_argument("--policy", type=Path, default=ROOT / "data/david-autopilot-policy.json")
    parser.add_argument("--item-index", type=int, default=0)
    parser.add_argument("--model-id")
    parser.add_argument("--item-id")
    parser.add_argument("--source-snapshot", type=Path)
    parser.add_argument("--adapter-policy", type=Path, default=ROOT / "data/david-source-adapter-policy.json")
    parser.add_argument("--include-supplier-queue", action="store_true")
    parser.add_argument("--supplier-queue-policy", type=Path, default=ROOT / "data/david-supplier-queue-policy.json")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    catalog = load_json(args.catalog)
    policy = load_json(args.policy)
    if args.api_snapshot:
        snapshot = load_json(args.api_snapshot)
        plan = build_plan_from_api_snapshot(
            catalog,
            snapshot,
            policy,
            item_index=args.item_index,
            model_id=args.model_id,
            item_id=args.item_id,
        )
    else:
        fixture_path = args.fixture or (ROOT / "data/sample-battery.json")
        fixture = load_json(fixture_path)
        plan = build_plan(catalog, fixture, policy, item_index=args.item_index)

    if args.source_snapshot:
        source_snapshot = load_json(args.source_snapshot)
        adapter_policy = load_json(args.adapter_policy)
        plan = attach_source_candidates(plan, source_snapshot, adapter_policy)

    if args.include_supplier_queue:
        supplier_queue_policy = load_json(args.supplier_queue_policy)
        plan = attach_supplier_queue(plan, supplier_queue_policy)

    payload = json.dumps(plan, indent=2, ensure_ascii=False) + "\n"

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    else:
        sys.stdout.write(payload)


if __name__ == "__main__":
    main()
