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
    require("MASTER PLAN" in html or "Етапи" in html, "index.html must expose master plan/stages UI")
    require('id="menuToggle"' in html and 'id="stagesButton"' in html, "index.html must expose burger menu and stages control")

    canonical = (ROOT / "docs/MASTER_AUTOPILOT_PLAN.md").read_text(encoding="utf-8")
    require("Source of truth" in canonical, "canonical master plan must declare itself source of truth")
    require("GREEN" in canonical and "Evidence log" in canonical, "canonical plan must define status/evidence protocol")

    # F04 integrity: data/master-plan.json must remain a faithful machine view
    # of the canonical task tables; fail CI on ID/title/status/dependency drift.
    canonical_tasks = {}
    for raw in canonical.splitlines():
        if not raw.startswith("|"):
            continue
        cells = [cell.strip() for cell in raw.split("|")[1:-1]]
        if len(cells) < 6:
            continue
        tid = cells[0]
        if len(tid) != 3 or not tid[0].isalpha() or not tid[1:].isdigit():
            continue
        canonical_tasks[tid] = {
            "title": cells[1],
            "dependsOn": cells[2],
            "status": cells[5].lower(),
        }

    machine_tasks = {}
    for gate in plan["gates"]:
        for task in gate["tasks"]:
            machine_tasks[task["id"]] = task

    require(set(machine_tasks) == set(canonical_tasks),
            "machine-readable task IDs must exactly match canonical task IDs")
    for tid, expected in canonical_tasks.items():
        actual = machine_tasks[tid]
        require(actual.get("title") == expected["title"],
                f"machine title drift for {tid}: {actual.get('title')!r} != {expected['title']!r}")
        require(actual.get("status") == expected["status"],
                f"machine status drift for {tid}: {actual.get('status')!r} != {expected['status']!r}")
        require(actual.get("dependsOn") == expected["dependsOn"],
                f"machine dependency drift for {tid}: {actual.get('dependsOn')!r} != {expected['dependsOn']!r}")

    print(f"PASS: repository contracts valid; {len(ids)} machine-readable tasks checked")


if __name__ == "__main__":
    main()
