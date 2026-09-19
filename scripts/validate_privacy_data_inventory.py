#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
inventory=json.loads((ROOT/"data/privacy-data-inventory.json").read_text(encoding="utf-8"))
doc=(ROOT/"docs/PRIVACY_DATA_INVENTORY.md").read_text(encoding="utf-8")

assert inventory.get("version")==1
assert inventory.get("task")=="R07"
assert inventory.get("status")=="partial"
assert "DPP Autopilot only" in inventory.get("scope","")

stores=inventory.get("stores",[])
assert len(stores)>=10, "R07 inventory unexpectedly small"
ids=[s["id"] for s in stores]
assert len(ids)==len(set(ids)), "R07 duplicate store IDs"

for store in stores:
    for key in ["classification","purpose","location","processor","tables","fields","retention","controls"]:
        assert key in store, f"R07 store {store['id']} missing {key}"
    retention=store["retention"]
    assert retention.get("status"), f"R07 store {store['id']} missing retention status"
    assert retention.get("current_behavior"), f"R07 store {store['id']} missing current retention behavior"

migration_tables=set()
pattern=re.compile(r"create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(dpp_[a-z0-9_]+)",re.I)
for path in sorted((ROOT/"supabase/migrations").glob("*.sql")):
    migration_tables.update(m.group(1).lower() for m in pattern.finditer(path.read_text(encoding="utf-8")))

inventory_tables={
    table.lower()
    for store in stores
    for table in store.get("tables",[])
    if table.lower().startswith("dpp_")
}

assert migration_tables, "R07 migration DPP table discovery returned empty"
missing=migration_tables-inventory_tables
extra=inventory_tables-migration_tables
assert not missing, f"R07 inventory missing DPP migration tables: {sorted(missing)}"
assert not extra, f"R07 inventory references unknown DPP migration tables: {sorted(extra)}"

auth_store=next(s for s in stores if s["id"]=="auth_identity")
assert "auth.users" in auth_store["tables"]
rate_store=next(s for s in stores if s["id"]=="rate_limit_transient")
assert rate_store["tables"]==[]
assert "IP" in rate_store["fields"] or "ip" in rate_store["fields"].lower()
assert "digest" in rate_store["fields"].lower()

processors=inventory.get("processors_and_recipients",[])
names={p["name"] for p in processors}
assert {"Supabase","Vercel","GitHub","EU DPP registry provider"} <= names

blockers=inventory.get("green_blockers",[])
assert len(blockers)>=5
assert any("M01-M13" in x for x in blockers)
assert any("R08" in x for x in blockers)

for token in [
    "R07 remains **RED/PARTIAL**",
    "Import staging",
    "Audit",
    "Rate-limit metadata",
    "Shared Supabase boundary",
]:
    assert token in doc, f"R07 document missing {token}"

print(f"R07_PRIVACY_DATA_INVENTORY_PASS: {len(migration_tables)} DPP migration tables have complete inventory coverage with purpose/location/processor/retention state")
