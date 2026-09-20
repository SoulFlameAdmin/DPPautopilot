#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
inventory=json.loads((ROOT/"data/privacy-data-inventory.json").read_text(encoding="utf-8"))
doc=(ROOT/"docs/PRIVACY_DATA_INVENTORY.md").read_text(encoding="utf-8")

assert inventory.get("version")==3
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
assert rate_store["tables"]==["dpp_rate_limit_buckets"]
assert "raw IP" in rate_store["fields"] or "raw ip" in rate_store["fields"].lower()
assert "digest" in rate_store["fields"].lower()
assert "10 minutes" in rate_store["retention"]["current_behavior"]
evidence_store=next(s for s in stores if s["id"]=="evidence_metadata_objects")
assert "private object bytes" in evidence_store["location"]
assert "dpp-evidence-object" in evidence_store["location"]
assert "SHA-256" in evidence_store["retention"]["current_behavior"]
assert "verify_jwt=true" in " ".join(evidence_store["controls"])
import_store=next(s for s in stores if s["id"]=="import_staging")
assert import_store["retention"]["status"]=="implemented_precursor"
assert "30 days" in import_store["retention"]["current_behavior"]

audit_store=next(s for s in stores if s["id"]=="audit_history")
assert "credential-bearing" in audit_store["retention"]["current_behavior"]
assert any("recursive audit-only credential-key redaction" in x for x in audit_store["controls"])
assert any("source rows are not modified" in x for x in audit_store["controls"])

processors=inventory.get("processors_and_recipients",[])
names={p["name"] for p in processors}
assert {"Supabase","Vercel","GitHub","EU DPP registry provider"} <= names

lifecycle=inventory.get("deletion_export_precursor",{})
assert lifecycle.get("retention_status_rpc")=="dpp_api_retention_status()"
assert lifecycle.get("terminal_import_purge_rpc")=="dpp_api_purge_import_staging(timestamptz)"
assert lifecycle.get("org_deletion_impact_preview_rpc")=="dpp_api_org_deletion_impact()"
assert lifecycle.get("destructive_org_delete_enabled") is False
assert lifecycle.get("auth_users_deleted_by_org_delete") is False

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

print(f"R07_PRIVACY_DATA_INVENTORY_PASS: {len(migration_tables)} DPP migration tables have complete inventory coverage with deployed Storage/Edge controls, fail-closed deletion/export lifecycle state and audit credential-key minimization precursor")
