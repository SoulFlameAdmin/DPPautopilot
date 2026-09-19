#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
contract=json.loads((ROOT/"data/incident-runbook-contract.json").read_text(encoding="utf-8"))
doc=(ROOT/"docs/INCIDENT_RUNBOOK.md").read_text(encoding="utf-8")

assert contract.get("version")==1
assert contract.get("task")=="R13"
assert contract.get("status")=="partial"
assert contract.get("runbook")=="docs/INCIDENT_RUNBOOK.md"

deps=contract.get("dependencies",{})
assert set(deps)=={"R09","R10","R11","R12"}
assert deps["R11"].startswith("green")
assert deps["R12"].startswith("green")

roles=set(contract.get("roles",[]))
for role in [
    "Incident commander","DPP operations owner","DPP platform owner",
    "Privacy/security lead","Communications owner"
]:
    assert role in roles

severities={s["id"]:s for s in contract.get("severities",[])}
assert set(severities)=={"SEV1","SEV2","SEV3"}
assert severities["SEV1"]["target_ack_minutes"]==15
assert severities["SEV2"]["target_ack_minutes"]==30
assert severities["SEV3"]["target_ack_minutes"]==240
assert any("tenant isolation" in x for x in severities["SEV1"]["criteria"])
assert any("data" in x.lower() for x in severities["SEV1"]["criteria"])

assert contract.get("required_phases")==[
    "detect_and_open","triage","contain","communicate","recover","verify","close_and_learn"
]

monitoring=set(contract.get("monitoring_signals",[]))
monitor_policy=json.loads((ROOT/"data/monitoring-alert-policy.json").read_text(encoding="utf-8"))
assert monitoring=={s["id"] for s in monitor_policy["signals"]}

for required in [
    "# DPP Autopilot Incident Runbook",
    "## 3. Severity and acknowledgement targets",
    "## 5. Triage",
    "## 6. Containment",
    "## 7. Communications",
    "## 8. Recovery, rollback and restore",
    "## 9. Data/privacy/security incident procedure",
    "## 10. Verification before closure",
    "## 11. Close and learn",
    "R11",
    "R12",
    "X-Request-ID",
    "tenant isolation",
    "Vercel deploy lease",
    "do not hard-code statutory notification deadlines",
]:
    assert required.lower() in doc.lower(), f"R13 runbook missing {required}"

for unsafe_claim in [
    "live paging is configured",
    "production rollback is proven",
    "f08 is green",
]:
    assert unsafe_claim not in doc.lower()

assert len(contract.get("safety_rules",[]))>=5
gaps=" ".join(contract.get("runtime_gaps",[]))
for term in ["R09","R10","C05","Legal/privacy"]:
    assert term.lower() in gaps.lower()

print("R13_INCIDENT_RUNBOOK_PASS: severity, owners, triage, containment, comms, recovery/restore, privacy-incident and closure procedures are versioned without claiming unavailable runtime capabilities")
