from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location("c15",ROOT/"scripts/final_acceptance_audit.py")
MOD=importlib.util.module_from_spec(SPEC); assert SPEC and SPEC.loader; SPEC.loader.exec_module(MOD)
POLICY=json.loads((ROOT/"data/final-acceptance-policy.json").read_text(encoding="utf-8"))
REAL_PLAN=json.loads((ROOT/"data/master-plan.json").read_text(encoding="utf-8"))

def deep_copy(value):
    return json.loads(json.dumps(value))

def make_all_required_green():
    plan=deep_copy(REAL_PLAN)
    for gate in plan["gates"]:
        gid=gate.get("id") or gate.get("name")
        if gid not in POLICY["required_gates"]:
            continue
        for task in gate.get("tasks",[]):
            if task["id"]=="C15":
                continue
            if gid=="RELEASE" and task["id"].startswith("C") and task["id"][1:].isdigit() and int(task["id"][1:])>14:
                continue
            task["status"]="green"
    return plan

def good_evidence():
    sha="abc123final"
    return {
        "c14_pack_ready":True,
        "final_ci":{"run_id":123456,"conclusion":"success","commit_sha":sha},
        "production":{
            "verified":True,"commit_sha":sha,"deployment_id":"dpl-final",
            "project_id":"prj-final","environment":"production","evidence_ref":"production-smoke:final"
        }
    }

class FinalAcceptanceTests(unittest.TestCase):
    def test_current_state_is_not_complete(self):
        report=MOD.evaluate(REAL_PLAN,MOD.current_evidence(),POLICY)
        self.assertFalse(report["complete"])
        self.assertEqual(report["decision"],"NOT_COMPLETE")
        self.assertTrue(report["non_green_tasks"])

    def test_all_required_green_plus_final_evidence_completes(self):
        report=MOD.evaluate(make_all_required_green(),good_evidence(),POLICY)
        self.assertTrue(report["complete"])
        self.assertEqual(report["decision"],"PROJECT_100_PERCENT_COMPLETE")
        MOD.verify(report)

    def test_any_mandatory_non_green_denies(self):
        plan=make_all_required_green()
        target=None
        for gate in plan["gates"]:
            for task in gate.get("tasks",[]):
                if task["id"]=="F08":
                    task["status"]="blocked";target=task
        self.assertIsNotNone(target)
        report=MOD.evaluate(plan,good_evidence(),POLICY)
        self.assertFalse(report["complete"])
        self.assertIn("mandatory_tasks_not_green",report["failures"])

    def test_missing_or_failing_final_ci_denies(self):
        plan=make_all_required_green()
        e=good_evidence();e["final_ci"]=None
        report=MOD.evaluate(plan,e,POLICY)
        self.assertIn("final_ci_not_proven",report["failures"])
        e=good_evidence();e["final_ci"]["conclusion"]="failure"
        report=MOD.evaluate(plan,e,POLICY)
        self.assertIn("final_ci_not_proven",report["failures"])

    def test_production_not_verified_or_commit_drift_denies(self):
        plan=make_all_required_green()
        e=good_evidence();e["production"]["verified"]=False
        report=MOD.evaluate(plan,e,POLICY)
        self.assertIn("production_not_verified",report["failures"])
        e=good_evidence();e["production"]["commit_sha"]="different"
        report=MOD.evaluate(plan,e,POLICY)
        self.assertIn("final_ci_production_commit_mismatch",report["failures"])

    def test_expansion_is_not_mandatory_for_c15(self):
        plan=make_all_required_green()
        for gate in plan["gates"]:
            if (gate.get("id") or gate.get("name"))=="EXPANSION":
                for task in gate.get("tasks",[]):
                    task["status"]="red"
        report=MOD.evaluate(plan,good_evidence(),POLICY)
        self.assertTrue(report["complete"])

if __name__=="__main__":
    unittest.main()
