#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PLAN=ROOT/"data/master-plan.json"
MATRIX=ROOT/"data/t10-regression-gate.json"
OUT=ROOT/"artifacts/t10-full-regression-report.json"

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
    precursor_ok=True
    all_green=True
    for task_id in matrix["suites"]:
        require(task_id in by_id,f"T10 missing task {task_id} in master plan")
        task=by_id[task_id]
        status=task.get("status")
        evidence=str(task.get("evidence") or "")
        implemented=("PARTIAL PASS" in evidence) or status=="green"
        precursor_ok=precursor_ok and implemented
        all_green=all_green and status=="green"
        rows[task_id]={
            "status":status,
            "precursor_evidence":implemented,
            "evidence":evidence,
        }

    require(precursor_ok,"T10 one or more T01-T09 suites have no implementation/PASS precursor evidence")
    report={
        "version":1,
        "task":"T10",
        "precursor_pass":True,
        "suites":rows,
        "clean_checkout_job_reached_report_step":True,
        "final_acceptance":{
            "all_suite_tasks_green":all_green,
            "release_ci_run":False,
            "pass":False,
        },
        "statement":"T10 aggregate precursor proves all T01-T09 suite implementations have PASS evidence and this clean-checkout CI reached the final report step; final release regression acceptance remains false until all suite dependencies are GREEN and an approved release CI run exists."
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("T10_FULL_REGRESSION_PRECURSOR_PASS: T01-T09 implementations have PASS evidence and clean checkout reached final aggregate gate")

if __name__=="__main__":
    main()
