#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY_PATH=ROOT/"data/final-acceptance-policy.json"
PLAN_PATH=ROOT/"data/master-plan.json"
PACK_PATH=ROOT/"docs/PRODUCTION_EVIDENCE.md"

class FinalAcceptanceDenied(AssertionError):
    pass

def mandatory_tasks(plan:dict[str,Any],policy:dict[str,Any])->list[dict[str,Any]]:
    out=[]
    for gate in plan.get("gates",[]):
        gate_id=gate.get("id") or gate.get("name")
        if gate_id not in policy["required_gates"]:
            continue
        for task in gate.get("tasks",[]):
            if task.get("id")=="C15":
                continue
            if gate_id=="RELEASE":
                tid=task.get("id","")
                if tid.startswith("C") and tid[1:].isdigit() and int(tid[1:])>14:
                    continue
            out.append(task)
    return out

def evaluate(plan:dict[str,Any],evidence:dict[str,Any],policy:dict[str,Any])->dict[str,Any]:
    required=mandatory_tasks(plan,policy)
    non_green=[
        {"id":t["id"],"title":t["title"],"status":t["status"],"evidence":t.get("evidence","")}
        for t in required if t.get("status")!="green"
    ]
    c14=next((t for t in required if t.get("id")=="C14"),None)
    pack_ready=evidence.get("c14_pack_ready") is True
    final_ci=evidence.get("final_ci")
    production=evidence.get("production")
    failures=[]

    if non_green:
        failures.append("mandatory_tasks_not_green")
    if not c14 or c14.get("status")!="green":
        failures.append("c14_not_green")
    if not pack_ready:
        failures.append("c14_pack_not_ready")
    if not isinstance(final_ci,dict) or final_ci.get("conclusion")!="success" or not final_ci.get("run_id") or not final_ci.get("commit_sha"):
        failures.append("final_ci_not_proven")
    if not isinstance(production,dict) or production.get("verified") is not True:
        failures.append("production_not_verified")
    else:
        for key in ["commit_sha","deployment_id","project_id","environment","evidence_ref"]:
            if not production.get(key):
                failures.append(f"production_{key}_missing")
        if production.get("environment")!="production":
            failures.append("production_environment_mismatch")

    if isinstance(final_ci,dict) and isinstance(production,dict):
        if final_ci.get("commit_sha") and production.get("commit_sha") and final_ci.get("commit_sha")!=production.get("commit_sha"):
            failures.append("final_ci_production_commit_mismatch")

    complete=not failures
    return {
        "task":"C15",
        "decision":policy["decision"]["complete"] if complete else policy["decision"]["incomplete"],
        "complete":complete,
        "mandatory_task_count":len(required),
        "green_mandatory_task_count":len(required)-len(non_green),
        "non_green_tasks":non_green,
        "failures":failures,
        "final_ci":final_ci,
        "production":production,
        "c14_pack_ready":pack_ready,
    }

def verify(report:dict[str,Any])->None:
    if not report.get("complete"):
        raise FinalAcceptanceDenied("C15 final acceptance denied: "+", ".join(report.get("failures",[])))
    if report.get("decision")!="PROJECT_100_PERCENT_COMPLETE":
        raise FinalAcceptanceDenied("C15 completion token mismatch")

def current_evidence()->dict[str,Any]:
    pack=PACK_PATH.read_text(encoding="utf-8") if PACK_PATH.is_file() else ""
    return {
        "c14_pack_ready":"**Final evidence-pack decision:** **READY**" in pack,
        "final_ci":None,
        "production":None,
    }

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--evidence",type=Path)
    ap.add_argument("--require-complete",action="store_true")
    args=ap.parse_args()
    policy=json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    plan=json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    evidence=json.loads(args.evidence.read_text(encoding="utf-8")) if args.evidence else current_evidence()
    report=evaluate(plan,evidence,policy)
    out=ROOT/policy["output"]
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    if args.require_complete:
        verify(report)
    print(f"C15_FINAL_AUDIT_{report['decision']}: {report['green_mandatory_task_count']}/{report['mandatory_task_count']} mandatory tasks GREEN; failures={','.join(report['failures']) or 'none'}")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
