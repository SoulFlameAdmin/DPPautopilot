#!/usr/bin/env python3
from __future__ import annotations

import argparse
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a deterministic DAVID DPP Autopilot action plan.")
    parser.add_argument("--fixture", type=Path, default=ROOT / "data/sample-battery.json")
    parser.add_argument("--catalog", type=Path, default=ROOT / "data/dpp-field-catalog.json")
    parser.add_argument("--policy", type=Path, default=ROOT / "data/david-autopilot-policy.json")
    parser.add_argument("--item-index", type=int, default=0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    catalog = load_json(args.catalog)
    fixture = load_json(args.fixture)
    policy = load_json(args.policy)
    plan = build_plan(catalog, fixture, policy, item_index=args.item_index)
    payload = json.dumps(plan, indent=2, ensure_ascii=False) + "\n"

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    else:
        sys.stdout.write(payload)


if __name__ == "__main__":
    main()
