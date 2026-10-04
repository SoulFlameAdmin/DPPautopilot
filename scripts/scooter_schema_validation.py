#!/usr/bin/env python3
from __future__ import annotations

import math
import re
from typing import Any

LIFECYCLE = {"original","repurposed","remanufactured","second_life","waste","retired"}
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _get(obj: Any, dotted: str):
    cur = obj
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None, False
        cur = cur[part]
    return cur, True


def _type_ok(value: Any, kind: str) -> bool:
    if kind in {"string","enum","document_ref"}:
        return isinstance(value, str) and bool(value.strip())
    if kind == "month":
        return isinstance(value, str) and bool(MONTH_RE.fullmatch(value))
    if kind == "number":
        return isinstance(value, (int,float)) and not isinstance(value, bool) and math.isfinite(float(value))
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind in {"array","document_ref_array"}:
        return isinstance(value, list)
    if kind == "object":
        return isinstance(value, dict)
    return value is not None


def validate_fixture(schema: dict, fixture: dict) -> list[str]:
    errors: list[str] = []
    if fixture.get("profileId") != schema.get("profileId"):
        errors.append("profileId mismatch")

    model = fixture.get("model")
    items = fixture.get("items")
    if not isinstance(model, dict):
        return errors + ["model must be an object"]
    if not isinstance(items, list) or not items:
        return errors + ["items must be a non-empty array"]

    category, exists = _get(fixture, "model.identification.category")
    if not exists or category != schema["validationRules"]["categoryEquals"]:
        errors.append("model.identification.category must equal light_means_of_transport")

    for field in schema["requiredFields"]:
        path, kind = field["path"], field["type"]
        if path.startswith("model."):
            value, present = _get(fixture, path)
            if not present:
                errors.append(f"missing required field: {path}")
            elif not _type_ok(value, kind):
                errors.append(f"wrong type/value for {path}: expected {kind}")
        elif path.startswith("item."):
            relative = path.removeprefix("item.")
            for idx,item in enumerate(items):
                value, present = _get(item, relative)
                if not present:
                    errors.append(f"item[{idx}] missing required field: {path}")
                elif not _type_ok(value, kind):
                    errors.append(f"item[{idx}] wrong type/value for {path}: expected {kind}")

    excluded = {row["path"] for row in schema.get("excludedConditionalFields", [])}
    if "model.exhaustion_capacity_threshold" not in excluded:
        errors.append("LMT schema must explicitly exclude conditional EV exhaustion threshold")

    ids = [item.get("unique_identifier") for item in items if isinstance(item, dict)]
    if any(not isinstance(v,str) or not (1 <= len(v.strip()) <= 300) for v in ids):
        errors.append("item unique_identifier must contain 1..300 characters")
    if len(ids) != len(set(ids)):
        errors.append("item unique_identifier values must be unique")

    weight,_ = _get(fixture,"model.physical.weight_kg")
    capacity,_ = _get(fixture,"model.rated_capacity_ah")
    renewable,_ = _get(fixture,"model.renewable_content_share")
    crate,_ = _get(fixture,"model.c_rate_test")
    if isinstance(weight,(int,float)) and weight <= 0: errors.append("model.physical.weight_kg must be > 0")
    if isinstance(capacity,(int,float)) and capacity <= 0: errors.append("model.rated_capacity_ah must be > 0")
    if isinstance(renewable,(int,float)) and not 0 <= renewable <= 100: errors.append("model.renewable_content_share must be 0..100")
    if isinstance(crate,(int,float)) and crate <= 0: errors.append("model.c_rate_test must be > 0")

    vmin,_ = _get(fixture,"model.voltage.minimum_v")
    vnom,_ = _get(fixture,"model.voltage.nominal_v")
    vmax,_ = _get(fixture,"model.voltage.maximum_v")
    if all(isinstance(v,(int,float)) for v in (vmin,vnom,vmax)) and not (0 < vmin <= vnom <= vmax):
        errors.append("model.voltage must satisfy 0 < minimum_v <= nominal_v <= maximum_v")

    tmin,_ = _get(fixture,"model.storage_temperature.minimum_c")
    tmax,_ = _get(fixture,"model.storage_temperature.maximum_c")
    if all(isinstance(v,(int,float)) for v in (tmin,tmax)) and tmin > tmax:
        errors.append("model.storage_temperature minimum_c must be <= maximum_c")

    for idx,item in enumerate(items):
        lifecycle=item.get("lifecycle_status")
        if lifecycle not in LIFECYCLE:
            errors.append(f"item[{idx}] unsupported lifecycle_status")
        cycles,_=_get(item,"usage.cycles")
        if isinstance(cycles,int) and not isinstance(cycles,bool) and cycles < 0:
            errors.append(f"item[{idx}] usage.cycles must be >= 0")
        soh,_=_get(item,"state_of_health.percent")
        if isinstance(soh,(int,float)) and not 0 <= soh <= 100:
            errors.append(f"item[{idx}] state_of_health.percent must be 0..100")
        socs,_=_get(item,"telemetry.state_of_charge")
        if isinstance(socs,list):
            for j,row in enumerate(socs):
                p=row.get("percent") if isinstance(row,dict) else None
                if not isinstance(p,(int,float)) or isinstance(p,bool) or not 0 <= p <= 100:
                    errors.append(f"item[{idx}] telemetry.state_of_charge[{j}].percent must be 0..100")
    return errors
