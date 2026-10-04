#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/monitoring-alert-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==4
assert policy.get("task")=="R10"
assert policy.get("status")=="partial"
assert policy.get("input_event")=="dpp_http_request"
assert policy.get("evaluation_window_seconds")==300
event_contract=policy.get("event_contract",{})
assert event_contract.get("source")=="data/observability-policy.json"
assert event_contract.get("allowed_surfaces_from_r09") is True
assert event_contract.get("request_id_pattern_from_r09") is True
assert event_contract.get("status_min")==100
assert event_contract.get("status_max")==599
assert event_contract.get("require_outcome_status_consistency") is True
assert event_contract.get("require_auth_present_boolean") is True
assert event_contract.get("invalid_events")=="discard"

owners=policy.get("owners",{})
assert owners.get("primary")=="DPP operations owner"
assert owners.get("secondary")=="DPP platform owner"

signals={s["id"]:s for s in policy.get("signals",[])}
expected={
    "availability_5xx_rate",
    "consecutive_5xx",
    "latency_p95",
    "auth_failure_rate",
    "rate_limit_pressure",
}
assert set(signals)==expected

assert signals["availability_5xx_rate"]["severity"]=="critical"
assert signals["availability_5xx_rate"]["minimum_requests"]==20
assert signals["availability_5xx_rate"]["threshold"]["value"]==0.05
assert signals["availability_5xx_rate"]["owner"]=="DPP operations owner"

assert signals["consecutive_5xx"]["severity"]=="critical"
assert signals["consecutive_5xx"]["threshold"]["value"]==5

assert signals["latency_p95"]["severity"]=="warning"
assert signals["latency_p95"]["threshold"]["value"]==2000
assert signals["latency_p95"]["owner"]=="DPP platform owner"

assert signals["auth_failure_rate"]["threshold"]["value"]==0.30
assert set(signals["auth_failure_rate"]["threshold"]["error_codes"])=={
    "AUTH_REQUIRED","FORBIDDEN","INSUFFICIENT_ROLE"
}

assert signals["rate_limit_pressure"]["threshold"]["value"]==0.20
assert signals["rate_limit_pressure"]["threshold"]["error_codes"]==["RATE_LIMITED"]

for signal in signals.values():
    assert signal["threshold"]["operator"]==">="
    assert signal["clear_below"] < signal["threshold"]["value"]
    assert signal["owner"] in owners.values()

drill=policy.get("synthetic_drill",{})
assert drill.get("contract")=="data/monitoring-incident-drill.json"
assert drill.get("executable_test")=="tests/api/monitoring-incident-drill.test.cjs"
assert drill.get("artifact")=="artifacts/r10-r13-monitoring-incident-drill.json"
assert drill.get("live_delivery_claimed") is False

drill_contract=json.loads((ROOT/"data/monitoring-incident-drill.json").read_text(encoding="utf-8"))
assert drill_contract.get("version")==1
assert drill_contract.get("status")=="partial"
assert drill_contract.get("input_event")=="dpp_http_request"
assert drill_contract["scenario"]["signal_id"]=="availability_5xx_rate"
assert drill_contract["scenario"]["incident_severity"]=="SEV1"
assert drill_contract["scenario"]["synthetic_timeline_minutes"]["acknowledge"]<=drill_contract["scenario"]["ack_target_minutes"]
assert drill_contract["safety"]["live_delivery_configured"] is False
assert drill_contract["safety"]["production_runtime_claimed"] is False

delivery=policy.get("delivery",{})
assert delivery.get("live_delivery_configured") is False
assert "R09" in delivery.get("reason","")
assert "F08" not in delivery.get("reason","")
assert len(delivery.get("required_before_green",[]))>=4

runtime_evidence=policy.get("runtime_evidence",{})
assert runtime_evidence.get("source")=="Vercel runtime error aggregation"
assert runtime_evidence.get("structured_event_observed") is True
assert runtime_evidence.get("deployment_id","").startswith("dpl_")
runtime_event=runtime_evidence.get("event_shape",{})
assert runtime_event.get("event")=="dpp_http_request"
assert runtime_event.get("surface")=="passport"
assert runtime_event.get("status")==500
assert runtime_event.get("outcome")=="server_error"
assert runtime_event.get("error_code")=="SERVER_CONFIGURATION_MISSING"
assert "does not prove" in runtime_evidence.get("scope_note","").lower()

helper=(ROOT/"api/_monitoring.js").read_text(encoding="utf-8")
for token in [
    "evaluateMonitoring",
    "dpp_http_request" if False else "eventsInWindow",
    "consecutive5xx",
    "p95_duration_ms",
    "error_code_ratio",
    "UNKNOWN_MONITORING_METRIC",
    "observabilityPolicy",
    "ALLOWED_SURFACES",
    "REQUEST_ID_RE",
    "expectedOutcome",
]:
    assert token in helper, f"R10 evaluator missing {token}"

r09=json.loads((ROOT/"data/observability-policy.json").read_text(encoding="utf-8"))
assert "timestamp_ms" in r09.get("logged_fields",[]), "R10 requires timestamp_ms in the R09 event contract"
assert r09.get("surfaces"), "R10 requires the R09 surface allowlist"
assert r09.get("correlation",{}).get("accepted_pattern"), "R10 requires the R09 request-id contract"

test=(ROOT/"tests/api/monitoring-alerts.test.cjs").read_text(encoding="utf-8")
for token in [
    "R10_MONITORING_ALERT_PRECURSOR_PASS",
    "critical availability alert fires",
    "five consecutive 5xx failures",
    "p95 latency warning",
    "auth failure warning",
    "rate-limit pressure warning",
    "five-minute window",
    "rejects malformed status surface request id and outcome",
]:
    assert token in test, f"R10 alert suite missing {token}"

drill_test=(ROOT/"tests/api/monitoring-incident-drill.test.cjs").read_text(encoding="utf-8")
for token in ["R10_R13_SYNTHETIC_FIRE_RECOVER_DRILL_PASS","synthetic critical availability drill fires","r10-r13-monitoring-incident-drill.json"]:
    assert token in drill_test, f"R10/R13 synthetic drill missing {token}"

print("R10_MONITORING_POLICY_PASS: thresholds/owners plus an executable synthetic fire->SEV1 mapping->recover drill are versioned; deployed ingestion/live notification/human acknowledgement remain intentionally unclaimed")
