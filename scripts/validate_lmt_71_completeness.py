#!/usr/bin/env python3
from __future__ import annotations
import copy,json
from pathlib import Path
from lmt_71_completeness import evaluate

ROOT=Path(__file__).resolve().parents[1]

def require(c: bool,m: str)->None:
    if not c: raise AssertionError(m)

def main()->None:
    matrix=json.loads((ROOT/"data/lmt-battery-71-v2.json").read_text(encoding="utf-8"))
    fixture=json.loads((ROOT/"data/scooter-battery-launch-sample-v2.json").read_text(encoding="utf-8"))
    result=evaluate(matrix,fixture,0)
    require(result["ready"],f"complete launch fixture not ready: {result}")
    require(result["missingCount"]==0,"complete fixture must have zero missing")
    require(result["requiredPointCount"]==52,"50 mandatory + two explicitly-applicable conditional points expected")
    # Deferred launch points are deliberately absent.
    require(not any(w["code"]=="NOT_REQUIRED_AT_LAUNCH_VALUE_PRESENT" for w in result["warnings"]),f"fixture populates launch-deferred data: {result['warnings']}")

    broken=copy.deepcopy(fixture)
    del broken["model"]["voltage"]["nominal_v"]
    failed=evaluate(matrix,broken,0)
    require(not failed["ready"],"missing mandatory point must fail readiness")
    require(any(m["number"]==27 for m in failed["missing"]),"point 27 must be identified as missing")

    undecided=copy.deepcopy(fixture)
    del undecided["pointApplicability"]["35"]
    undecided_result=evaluate(matrix,undecided,0)
    require(not undecided_result["ready"],"undecided conditional applicability must fail readiness")
    require(any(w["number"]==35 and w["code"]=="APPLICABILITY_DECISION_REQUIRED" for w in undecided_result["warnings"]),"point 35 decision warning missing")

    print("LMT_71_COMPLETENESS_PASS: launch fixture ready; missing mandatory and undecided conditional cases fail deterministically")

if __name__=="__main__":
    main()
