#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/"data/dpp-field-catalog.json").read_text(encoding="utf-8"))
sql=(ROOT/"supabase/migrations/20260918231500_dpp_core_schema.sql").read_text(encoding="utf-8").lower()

def require(c,m):
    if not c: raise AssertionError(m)

typed_columns={
    "dpp_battery_models":{
        "manufacturer_name","category","model_identifier","canonical_data",
    },
    "dpp_battery_items":{
        "unique_identifier","lifecycle_status","canonical_data",
    },
}

for field in catalog["fields"]:
    target=field["dbTarget"]
    parts=target.split(".")
    require(len(parts)>=2,f"{field['path']} invalid dbTarget {target}")
    table,column=parts[0],parts[1]
    require(table in typed_columns,f"{field['path']} points outside M04 canonical model/item storage: {target}")
    require(f"create table public.{table}" in sql,f"{field['path']} target table missing from M04 migration: {table}")
    require(column in typed_columns[table],f"{field['path']} points to non-existent M04 column: {target}")
    if column=="canonical_data":
        require(len(parts)>=3,f"{field['path']} canonical_data target must include a JSON path")
        expected=field["path"].split(".",1)[1]
        actual=".".join(parts[2:])
        require(actual==expected,f"{field['path']} JSON path drift: {actual} != {expected}")

require(all(f.get("access") for f in catalog["fields"]),"every M09 mapping must preserve access class")
require(all(f.get("source") for f in catalog["fields"]),"every M09 mapping must preserve requirement source")
print(f"M09_SCHEMA_TRACEABILITY_PASS: {len(catalog['fields'])} requirement fields map to real M04 typed columns or exact canonical_data JSON paths")
