#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
POLICY_PATH=ROOT/"data/production-evidence-pack-policy.json"
PLAN_PATH=ROOT/"data/master-plan.json"

def flatten_tasks(plan:dict)->dict[str,dict]:
    out={}
    for gate in plan.get("gates",[]):
        for task in gate.get("tasks",[]):
            out[task["id"]]=task
    return out

def clean(value:object)->str:
    return " ".join(str(value or "").split())

def build_document()->str:
    policy=json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    plan=json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    tasks=flatten_tasks(plan)

    deps=policy["dependencies"]
    dependency_rows=[]
    ready=True
    for task_id in deps:
        task=tasks[task_id]
        status=task["status"]
        if status!="green":
            ready=False
        dependency_rows.append((task_id,task["title"],status,clean(task.get("evidence"))))

    lines=[
        "# DPP Autopilot — Production Evidence Pack",
        "",
        "> C14 status: **RED / PARTIAL precursor**. This document indexes repository evidence and intentionally does not claim production acceptance while C07–C13 are incomplete or blocked.",
        "",
        f"**Final evidence-pack decision:** **{'READY' if ready else 'NOT READY'}**",
        "",
        "The final decision is fail-closed: every C07–C13 dependency must be GREEN. C12 legal/compliance sign-off and C13 pilot UAT require external evidence and cannot be synthesized by repository tests.",
        "",
        "## C07–C13 final-gate dependencies",
        "",
        "| Task | Title | Status | Evidence |",
        "| --- | --- | --- | --- |",
    ]
    for task_id,title,status,evidence in dependency_rows:
        lines.append(f"| {task_id} | {title} | {status.upper()} | {evidence or 'No accepted evidence yet.'} |")

    section_titles={
        "source_ci":"Source of truth and CI",
        "migrations_data":"Database and migration evidence",
        "testing":"Test and reliability evidence",
        "deployment_release":"Deployment and release evidence",
        "operations_security":"Operations, recovery and security evidence",
        "privacy_compliance":"Privacy, traceability and compliance evidence",
    }
    for key,title in section_titles.items():
        lines.extend(["",f"## {title}",""])
        for task_id in policy["sections"][key]:
            task=tasks[task_id]
            lines.append(f"- **{task_id} — {task['title']} — {task['status'].upper()}** — {clean(task.get('evidence')) or 'No accepted evidence yet.'}")

    migrations=sorted((ROOT/"supabase/migrations").glob("*.sql"))
    lines.extend(["","## Versioned migration files",""])
    for path in migrations:
        lines.append(f"- `{path.relative_to(ROOT).as_posix()}`")

    lines.extend(["","## Required repository artifacts",""])
    for rel in policy["required_repository_artifacts"]:
        state="PRESENT" if (ROOT/rel).is_file() else "MISSING"
        lines.append(f"- **{state}** — `{rel}`")

    lines.extend([
        "",
        "## External sign-off boundaries",
        "",
        "- **C12 legal/compliance sign-off:** external qualified reviewer evidence is required; this pack does not claim or generate it.",
        "- **C13 pilot customer UAT:** real pilot-customer acceptance evidence is required; this pack does not claim or generate it.",
        "- **F08 production deployment:** remains a separate production-runtime prerequisite; this pack does not treat repository configuration as a deployed production system.",
        "",
        "## Non-claims",
        "",
    ])
    for item in policy["must_not_claim"]:
        lines.append(f"- {item}")

    lines.extend([
        "",
        "## C14 GREEN rule",
        "",
        "C14 may become GREEN only after the pack is refreshed for the exact final production commit/deployment and C07–C13 are GREEN with concrete evidence. C15 remains the separate 100% final acceptance gate.",
        "",
    ])
    return "\n".join(lines)

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--check",action="store_true")
    args=ap.parse_args()
    output=ROOT/json.loads(POLICY_PATH.read_text(encoding="utf-8"))["output"]
    rendered=build_document()
    if args.check:
        if not output.is_file():
            raise SystemExit("C14 production evidence document missing")
        current=output.read_text(encoding="utf-8")
        required=[
            "# DPP Autopilot — Production Evidence Pack",
            "Final evidence-pack decision",
            "C07–C13 final-gate dependencies",
            "External sign-off boundaries",
            "C14 GREEN rule",
        ]
        for token in required:
            if token not in current:
                raise SystemExit(f"C14 production evidence document missing {token}")
        print("C14_PRODUCTION_EVIDENCE_PACK_CHECK_PASS: document exists with fail-closed dependency/sign-off boundaries")
        return 0
    output.write_text(rendered,encoding="utf-8")
    print(output.relative_to(ROOT).as_posix())
    return 0

if __name__=="__main__":
    raise SystemExit(main())
