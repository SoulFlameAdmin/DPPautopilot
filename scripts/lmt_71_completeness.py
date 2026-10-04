#!/usr/bin/env python3
from __future__ import annotations
from typing import Any

def get_path(obj: Any, dotted: str):
    cur=obj
    for part in dotted.split("."):
        if not isinstance(cur,dict) or part not in cur:
            return None,False
        cur=cur[part]
    return cur,True

def present(value: Any)->bool:
    if value is None: return False
    if isinstance(value,str): return bool(value.strip())
    if isinstance(value,(list,dict)): return len(value)>0
    return True

def _value_for_point(fixture: dict, point: dict, item_index: int):
    path=point["valuePath"]
    if path.startswith("item."):
        items=fixture.get("items") or []
        item=items[item_index] if len(items)>item_index else {}
        return get_path(item,path.removeprefix("item."))
    return get_path(fixture,path)

def evaluate(matrix: dict, fixture: dict, item_index: int=0)->dict:
    applicability=fixture.get("pointApplicability") or {}
    required=[]
    optional=[]
    not_required=[]
    missing=[]
    warnings=[]
    present_count=0
    for point in matrix["points"]:
        n=point["number"]
        status=point["lmtStatusAt2027_02_18"]
        value,exists=_value_for_point(fixture,point,item_index)
        is_present=exists and present(value)

        if status=="mandatory":
            required.append(n)
            if is_present: present_count+=1
            else: missing.append({"number":n,"name":point["name"],"valuePath":point["valuePath"],"legalSource":point["legalSource"]})
        elif status=="if_applicable":
            decision=applicability.get(str(n))
            if decision is None:
                warnings.append({"number":n,"code":"APPLICABILITY_DECISION_REQUIRED","name":point["name"]})
            elif decision is True:
                required.append(n)
                if is_present: present_count+=1
                else: missing.append({"number":n,"name":point["name"],"valuePath":point["valuePath"],"legalSource":point["legalSource"]})
            elif decision is False and is_present:
                warnings.append({"number":n,"code":"VALUE_PRESENT_WHILE_NOT_APPLICABLE","name":point["name"]})
        elif status=="optional":
            optional.append(n)
        elif status=="not_required_2027":
            not_required.append(n)
            if is_present:
                warnings.append({"number":n,"code":"NOT_REQUIRED_AT_LAUNCH_VALUE_PRESENT","name":point["name"]})

    total=len(required)
    score=round((present_count/total)*100,1) if total else 100.0
    return {
        "itemIndex":item_index,
        "requiredPointCount":total,
        "presentRequiredPointCount":present_count,
        "missingCount":len(missing),
        "score":score,
        "missing":missing,
        "warnings":warnings,
        "optionalPoints":optional,
        "notRequiredAtLaunch":not_required,
        "ready":len(missing)==0 and not any(w["code"]=="APPLICABILITY_DECISION_REQUIRED" for w in warnings)
    }
