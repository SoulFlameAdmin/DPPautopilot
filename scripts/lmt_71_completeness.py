#!/usr/bin/env python3
from __future__ import annotations
import math
import re
from typing import Any

MONTH_RE=re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


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


def _type_ok(value: Any, kind: str)->bool:
    if kind in {"string","enum","document_ref"}:
        return isinstance(value,str) and bool(value.strip())
    if kind=="month":
        return isinstance(value,str) and bool(MONTH_RE.fullmatch(value))
    if kind=="number":
        return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(float(value))
    if kind=="integer":
        return isinstance(value,int) and not isinstance(value,bool)
    if kind=="array":
        return isinstance(value,list) and len(value)>0
    if kind=="object":
        return isinstance(value,dict) and len(value)>0
    if kind=="document_ref_array":
        return isinstance(value,list) and len(value)>0 and all(isinstance(v,str) and bool(v.strip()) for v in value)
    return False


def _point_validation_error(point: dict, value: Any)->str|None:
    kind=point.get("valueType")
    if not _type_ok(value,kind):
        return "VALUE_TYPE_INVALID"
    unit=point.get("unit")
    if unit=="%" and not 0 <= float(value) <= 100:
        return "PERCENT_OUT_OF_RANGE"
    if unit=="cycles" and value < 0:
        return "CYCLES_NEGATIVE"
    if point.get("valuePath")=="item.unique_identifier":
        if not isinstance(value,str) or not (1 <= len(value.strip()) <= 300) or not value.isprintable():
            return "IDENTIFIER_INVALID"
    return None


def _invalid_entry(point: dict, code: str)->dict:
    return {
        "number":point["number"],
        "code":code,
        "name":point["name"],
        "valuePath":point["valuePath"],
        "valueType":point["valueType"],
        "unit":point.get("unit"),
        "legalSource":point["legalSource"]
    }


def _ordered_group_errors(matrix: dict, fixture: dict, item_index: int)->list[dict]:
    errors=[]
    by_path={p["valuePath"]:p for p in matrix["points"]}
    for paths in matrix.get("validation",{}).get("orderedGroups",[]):
        values=[]
        valid=True
        for path in paths:
            point=by_path.get(path)
            if point is None:
                valid=False
                break
            value,exists=_value_for_point(fixture,point,item_index)
            if not exists or not _type_ok(value,point["valueType"]):
                valid=False
                break
            values.append(value)
        if valid and any(values[i] > values[i+1] for i in range(len(values)-1)):
            point=by_path[paths[0]]
            entry=_invalid_entry(point,"ORDERED_GROUP_INVALID")
            entry["valuePaths"]=list(paths)
            errors.append(entry)
    return errors


def evaluate(matrix: dict, fixture: dict, item_index: int=0)->dict:
    applicability=fixture.get("pointApplicability") or {}
    required=[]
    optional=[]
    not_required=[]
    missing=[]
    invalid=[]
    warnings=[]
    present_count=0
    valid_count=0
    for point in matrix["points"]:
        n=point["number"]
        status=point["lmtStatusAt2027_02_18"]
        value,exists=_value_for_point(fixture,point,item_index)
        is_present=exists and present(value)
        validation_error=_point_validation_error(point,value) if is_present else None

        if status=="mandatory":
            required.append(n)
            if is_present:
                present_count+=1
                if validation_error:
                    invalid.append(_invalid_entry(point,validation_error))
                else:
                    valid_count+=1
            else:
                missing.append({"number":n,"name":point["name"],"valuePath":point["valuePath"],"legalSource":point["legalSource"]})
        elif status=="if_applicable":
            decision=applicability.get(str(n))
            if decision is None:
                warnings.append({"number":n,"code":"APPLICABILITY_DECISION_REQUIRED","name":point["name"]})
            elif decision is True:
                required.append(n)
                if is_present:
                    present_count+=1
                    if validation_error:
                        invalid.append(_invalid_entry(point,validation_error))
                    else:
                        valid_count+=1
                else:
                    missing.append({"number":n,"name":point["name"],"valuePath":point["valuePath"],"legalSource":point["legalSource"]})
            elif decision is False and is_present:
                warnings.append({"number":n,"code":"VALUE_PRESENT_WHILE_NOT_APPLICABLE","name":point["name"]})
        elif status=="optional":
            optional.append(n)
            if is_present and validation_error:
                invalid.append(_invalid_entry(point,validation_error))
        elif status=="not_required_2027":
            not_required.append(n)
            # Some Commission rows are launch-deferred duplicate views of data that is
            # already mandatory elsewhere (for example material-composition grouping
            # and rated capacity). Presence of the underlying canonical value must not
            # create a false warning when the row is explicitly mapped as a derived duplicate.
            if is_present and point.get("sourceOwner")!="derived_duplicate":
                warnings.append({"number":n,"code":"NOT_REQUIRED_AT_LAUNCH_VALUE_PRESENT","name":point["name"]})

    # Matrix-defined cross-field ordering is part of value validity, not merely presence.
    ordered_errors=_ordered_group_errors(matrix,fixture,item_index)
    existing={(x["number"],x["code"]) for x in invalid}
    for entry in ordered_errors:
        if (entry["number"],entry["code"]) not in existing:
            invalid.append(entry)

    total=len(required)
    score=round((valid_count/total)*100,1) if total else 100.0
    return {
        "itemIndex":item_index,
        "requiredPointCount":total,
        "presentRequiredPointCount":present_count,
        "validRequiredPointCount":valid_count,
        "missingCount":len(missing),
        "invalidCount":len(invalid),
        "score":score,
        "missing":missing,
        "invalid":invalid,
        "warnings":warnings,
        "optionalPoints":optional,
        "notRequiredAtLaunch":not_required,
        "ready":len(missing)==0 and len(invalid)==0 and not any(w["code"]=="APPLICABILITY_DECISION_REQUIRED" for w in warnings)
    }
