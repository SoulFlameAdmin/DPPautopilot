#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from scooter_schema_validation import validate_fixture

ROOT=Path(__file__).resolve().parents[1]

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    schema=json.loads((ROOT/"data/scooter-battery-schema-v1.json").read_text(encoding="utf-8"))
    fixture=json.loads((ROOT/"data/scooter-battery-sample-v1.json").read_text(encoding="utf-8"))
    profile=json.loads((ROOT/"data/scooter-battery-profile-v1.json").read_text(encoding="utf-8"))
    catalog=json.loads((ROOT/"data/dpp-field-catalog.json").read_text(encoding="utf-8"))

    expected=[f for f in catalog["fields"] if f.get("required") is True]
    require(schema["profileId"]==profile["profileId"],"schema/profile id mismatch")
    require(schema["batteryCategory"]==profile["batteryCategory"]=="light_means_of_transport","schema must target LMT")
    require(schema["requiredFieldCount"]==42,"unexpected LMT required field count")
    require(schema["requiredModelFieldCount"]==34,"unexpected LMT model field count")
    require(schema["requiredItemFieldCount"]==8,"unexpected LMT item field count")
    require({f["path"] for f in schema["requiredFields"]}=={f["path"] for f in expected},"schema required paths drifted from catalog")
    require("model.exhaustion_capacity_threshold" in {x["path"] for x in schema["excludedConditionalFields"]},"conditional EV-only field must be excluded from LMT required set")

    errors=validate_fixture(schema,fixture)
    require(not errors,"valid LMT fixture failed: "+"; ".join(errors))

    print("STAGE3_LMT_SCHEMA_PASS: 42 required LMT fields (34 model + 8 item) validated with type, category, range, ordering, lifecycle and identifier rules")

if __name__=="__main__":
    main()
