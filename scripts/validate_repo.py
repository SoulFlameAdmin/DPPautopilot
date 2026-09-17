#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_json(rel):
    path = ROOT / rel
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    required_files = [
        "README.md",
        "index.html",
        "vercel.json",
        "data/master-plan.json",
        "data/worker-status.json",
        "docs/MASTER_AUTOPILOT_PLAN.md",
    ]
    for rel in required_files:
        require((ROOT / rel).is_file(), f"missing required file: {rel}")

    plan = load_json("data/master-plan.json")
    worker = load_json("data/worker-status.json")
    load_json("vercel.json")

    require(isinstance(plan.get("gates"), list) and plan["gates"], "plan.gates must be a non-empty list")
    allowed = {"green", "yellow", "red", "blocked"}
    ids = set()
    for gate in plan["gates"]:
        require(gate.get("id"), "every gate requires id")
        require(isinstance(gate.get("tasks"), list), f"gate {gate.get('id')} tasks must be a list")
        for task in gate["tasks"]:
            tid = task.get("id")
            require(tid, f"task in gate {gate['id']} missing id")
            require(tid not in ids, f"duplicate task id: {tid}")
            ids.add(tid)
            status = task.get("status")
            require(status in allowed, f"invalid status for {tid}: {status}")
            require(task.get("title"), f"task {tid} missing title")
            require("evidence" in task, f"task {tid} missing evidence field")
            if status == "green":
                evidence = str(task.get("evidence", "")).strip()
                require(evidence and evidence.lower() not in {"not started", "todo", "tbd"}, f"GREEN task {tid} requires concrete evidence text")

    required_worker = {
        "worker", "mode", "state", "currentTask", "currentGate",
        "lastCompletedTask", "nextTask", "message", "updatedAt"
    }
    missing_worker = sorted(required_worker - set(worker))
    require(not missing_worker, f"worker status missing fields: {missing_worker}")

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    require("data/master-plan.json" in html, "index.html must load data/master-plan.json")
    require("data/worker-status.json" in html, "index.html must load data/worker-status.json")
    require("MASTER PLAN" in html, "index.html must expose master plan UI")

    canonical = (ROOT / "docs/MASTER_AUTOPILOT_PLAN.md").read_text(encoding="utf-8")
    require("Source of truth" in canonical, "canonical master plan must declare itself source of truth")
    require("GREEN" in canonical and "Evidence log" in canonical, "canonical plan must define status/evidence protocol")

    print(f"PASS: repository contracts valid; {len(ids)} machine-readable tasks checked")


if __name__ == "__main__":
    main()
