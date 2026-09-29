#!/usr/bin/env python3
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "dpp-field-catalog.json"
PILOT_PATH = ROOT / "data" / "bg-battery-pilot-v1.json"
INTAKE_PATH = ROOT / "data" / "bg-battery-pilot-intake.csv"

VALID_STATUSES = {"green", "yellow", "red", "blocked"}
ALLOWED_ACCESS = {"public", "public_identifier"}

def fail(message: str) -> None:
    raise SystemExit(f"BG_BATTERY_PILOT_CONTRACT_FAIL: {message}")

catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
pilot = json.loads(PILOT_PATH.read_text(encoding="utf-8"))

if pilot.get("market") != "BG":
    fail("market must be BG")
if pilot.get("mode") != "managed_pilot":
    fail("mode must remain managed_pilot until self-service acceptance is evidenced")
if pilot.get("firstVertical") != "industrial_energy_storage_over_2_kwh":
    fail("first vertical drifted")
if pilot.get("regulation", {}).get("batteryPassportStart") != "2027-02-18":
    fail("battery passport start date drifted")
if pilot.get("acceptance", {}).get("itemsMinimum", 0) < 10:
    fail("acceptance dataset must contain at least 10 item records")
if pilot.get("acceptance", {}).get("publicRestrictedLeakMaximum") != 0:
    fail("restricted-field leakage tolerance must remain zero")

catalog_by_path = {field["path"]: field for field in catalog.get("fields", [])}
expected = [
    field["path"]
    for field in catalog.get("fields", [])
    if field.get("access") in ALLOWED_ACCESS
]

with INTAKE_PATH.open("r", encoding="utf-8", newline="") as handle:
    reader = csv.reader(handle)
    try:
        headers = next(reader)
    except StopIteration:
        fail("intake CSV is empty")

if len(headers) != len(set(headers)):
    fail("intake CSV contains duplicate headers")
if headers != expected:
    missing = [field for field in expected if field not in headers]
    extra = [field for field in headers if field not in expected]
    fail(f"intake headers must exactly match public catalog order; missing={missing}; extra={extra}")

for path in headers:
    field = catalog_by_path.get(path)
    if not field:
        fail(f"unknown intake field: {path}")
    if field.get("access") not in ALLOWED_ACCESS:
        fail(f"restricted field leaked into intake: {path} ({field.get('access')})")

gates = pilot.get("gates", [])
expected_gate_ids = [f"BG{i:02d}" for i in range(1, 11)]
actual_gate_ids = [gate.get("id") for gate in gates]
if actual_gate_ids != expected_gate_ids:
    fail(f"pilot gates must remain BG01-BG10 in order; got {actual_gate_ids}")
for gate in gates:
    if gate.get("status") not in VALID_STATUSES:
        fail(f"invalid status for {gate.get('id')}: {gate.get('status')}")

print(
    "BG_BATTERY_PILOT_CONTRACT_PASS "
    f"fields={len(headers)} gates={len(gates)} mode={pilot['mode']} market={pilot['market']}"
)
