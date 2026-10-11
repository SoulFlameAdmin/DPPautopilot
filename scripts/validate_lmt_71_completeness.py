#!/usr/bin/env python3
from __future__ import annotations
import copy,json,math
from pathlib import Path
from lmt_71_completeness import evaluate

ROOT=Path(__file__).resolve().parents[1]

def require(c: bool,m: str)->None:
    if not c: raise AssertionError(m)

def has_invalid(result: dict, number: int, code: str)->bool:
    return any(x.get("number")==number and x.get("code")==code for x in result.get("invalid",[]))

def main()->None:
    matrix=json.loads((ROOT/"data/lmt-battery-71-v2.json").read_text(encoding="utf-8"))
    fixture=json.loads((ROOT/"data/scooter-battery-launch-sample-v2.json").read_text(encoding="utf-8"))
    result=evaluate(matrix,fixture,0)
    require(result["ready"],f"complete launch fixture not ready: {result}")
    require(result["missingCount"]==0,"complete fixture must have zero missing")
    require(result["invalidCount"]==0,"complete fixture must have zero invalid values")
    require(result["requiredPointCount"]==52,"50 mandatory + two explicitly-applicable conditional points expected")
    require(result["validRequiredPointCount"]==52,"all required launch values must be valid")
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

    wrong_type=copy.deepcopy(fixture)
    wrong_type["model"]["voltage"]["nominal_v"]="48 V"
    wrong_type_result=evaluate(matrix,wrong_type,0)
    require(not wrong_type_result["ready"],"string in numeric voltage point must fail readiness")
    require(has_invalid(wrong_type_result,27,"VALUE_TYPE_INVALID"),"point 27 wrong-type error missing")

    wrong_percent=copy.deepcopy(fixture)
    wrong_percent["items"][0]["performance"]["capacity_fade_pct"]=120
    wrong_percent_result=evaluate(matrix,wrong_percent,0)
    require(not wrong_percent_result["ready"],"percentage outside 0..100 must fail readiness")
    require(has_invalid(wrong_percent_result,52,"PERCENT_OUT_OF_RANGE"),"point 52 percentage range error missing")

    wrong_month=copy.deepcopy(fixture)
    wrong_month["model"]["identification"]["date_of_manufacture"]="2026-13"
    wrong_month_result=evaluate(matrix,wrong_month,0)
    require(not wrong_month_result["ready"],"invalid YYYY-MM month must fail readiness")
    require(has_invalid(wrong_month_result,9,"VALUE_TYPE_INVALID"),"point 9 month error missing")

    wrong_order=copy.deepcopy(fixture)
    wrong_order["model"]["voltage"]["minimum_v"]=55
    wrong_order_result=evaluate(matrix,wrong_order,0)
    require(not wrong_order_result["ready"],"invalid voltage ordering must fail readiness")
    require(has_invalid(wrong_order_result,26,"ORDERED_GROUP_INVALID"),"voltage ordering error missing")

    wrong_docs=copy.deepcopy(fixture)
    wrong_docs["model"]["compliance_test_reports"]=[{"ref":"not-a-document-ref"}]
    wrong_docs_result=evaluate(matrix,wrong_docs,0)
    require(not wrong_docs_result["ready"],"non-string document reference array must fail readiness")
    require(has_invalid(wrong_docs_result,50,"VALUE_TYPE_INVALID"),"point 50 document-ref-array error missing")

    nonfinite=copy.deepcopy(fixture)
    nonfinite["items"][0]["performance"]["power_w"]=math.inf
    nonfinite_result=evaluate(matrix,nonfinite,0)
    require(not nonfinite_result["ready"],"non-finite numeric value must fail readiness")
    require(has_invalid(nonfinite_result,53,"VALUE_TYPE_INVALID"),"point 53 finite-number error missing")

    conditional_bad_integer=copy.deepcopy(fixture)
    conditional_bad_integer["pointApplicability"]["68"]=True
    conditional_bad_integer["items"][0]["usage"]["cycles"]=True
    conditional_result=evaluate(matrix,conditional_bad_integer,0)
    require(not conditional_result["ready"],"boolean must not pass as integer cycle count")
    require(has_invalid(conditional_result,68,"VALUE_TYPE_INVALID"),"point 68 integer error missing")

    print("LMT_71_COMPLETENESS_PASS: presence + applicability + value types + percent/cycle domains + ordered groups fail closed")

if __name__=="__main__":
    main()
