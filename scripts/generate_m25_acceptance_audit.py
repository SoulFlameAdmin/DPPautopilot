#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PLAN=ROOT/"data/master-plan.json"
MATRIX=ROOT/"data/m25-acceptance-audit.json"
OUT=ROOT/"artifacts/m25-acceptance-audit.json"

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    plan=json.loads(PLAN.read_text(encoding="utf-8"))
    matrix=json.loads(MATRIX.read_text(encoding="utf-8"))
    by_id={}
    for gate in plan.get("gates",[]):
        for task in gate.get("tasks",[]):
            by_id[task["id"]]=task

    rows={}
    blockers=[]
    all_green=True
    for task_id in matrix["tasks"]:
        require(task_id in by_id,f"M25 missing {task_id}")
        task=by_id[task_id]
        status=task.get("status")
        evidence=str(task.get("evidence") or "")
        require(evidence and not evidence.startswith("Unfinished"),
                f"M25 {task_id} has no concrete evidence")
        concrete=("PASS" in evidence) or status in {"green","blocked"}
        require(concrete,f"M25 {task_id} lacks PASS/PARTIAL/BLOCKED evidence")
        all_green=all_green and status=="green"
        if status!="green":
            blockers.append({"id":task_id,"status":status,"evidence":evidence})
        rows[task_id]={"status":status,"evidence":evidence}

    report={
      "version":1,
      "task":"M25",
      "precursor_pass":True,
      "tasks":rows,
      "non_green_count":len(blockers),
      "blockers":blockers,
      "final_acceptance":{
        "all_m01_m24_green":all_green,
        "preview_e2e_pass":False,
        "p0_open":None,
        "p1_open":None,
        "pass":False
      },
      "statement":"M25 audit precursor inventories concrete M01-M24 evidence and remaining blockers; final MVP acceptance remains false until all tasks are GREEN, preview E2E passes, and P0/P1 counts are proven zero."
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"M25_ACCEPTANCE_AUDIT_PRECURSOR_PASS: M01-M24 evidence inventoried; {len(blockers)} non-green tasks remain")

if __name__=="__main__":
    main()
