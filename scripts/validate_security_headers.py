#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
vercel=json.loads((ROOT/"vercel.json").read_text(encoding="utf-8"))
policy=json.loads((ROOT/"data/security-headers-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==1
assert policy.get("task")=="R02"
assert policy.get("status")=="partial"
assert policy.get("source")=="vercel.json"

entries=vercel.get("headers",[])
global_entry=next((x for x in entries if x.get("source")=="/(.*)"),None)
assert global_entry is not None, "R02 global Vercel header rule missing"
actual={h["key"]:h["value"] for h in global_entry.get("headers",[])}
expected=policy.get("headers",{})
assert actual==expected, f"R02 vercel.json header set drifted: {actual!r}"

required={
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
}
assert set(actual)==required, f"R02 required header set mismatch: {set(actual)!r}"

csp=actual["Content-Security-Policy"]
for directive in [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
]:
    assert directive in csp, f"R02 CSP missing {directive}"

assert "http://" not in csp.lower()
assert "'unsafe-eval'" not in csp
assert actual["Strict-Transport-Security"]=="max-age=31536000"
assert actual["X-Content-Type-Options"]=="nosniff"
assert actual["X-Frame-Options"]=="DENY"
assert actual["Referrer-Policy"]=="no-referrer"

permissions=actual["Permissions-Policy"]
for token in ["camera=(self)","microphone=()","geolocation=()","payment=()","usb=()"]:
    assert token in permissions, f"R02 Permissions-Policy missing {token}"

data_entry=next((x for x in entries if x.get("source")=="/data/(.*)"),None)
assert data_entry is not None, "R02 must preserve DPP data cache rule"
data_headers={h["key"]:h["value"] for h in data_entry.get("headers",[])}
assert data_headers.get("Cache-Control")=="no-store, max-age=0"

compat=policy.get("csp_compatibility",{})
assert compat.get("supabase_connect")==["https://*.supabase.co","wss://*.supabase.co"]
assert "unsafe-inline" in compat.get("inline_scripts_styles","")
assert "nonce" in compat.get("inline_scripts_styles","").lower() or "hash" in compat.get("inline_scripts_styles","").lower()

live=policy.get("live_acceptance_required",[])
assert len(live)>=4
assert any("TLS" in x for x in live)
assert any("Live response headers" in x for x in live)
blockers=" ".join(policy.get("blockers",[]))
assert "F08" in blockers
assert "No live TLS/header scan" in blockers

print("R02_SECURITY_HEADERS_POLICY_PASS: global deploy-time CSP/HSTS/MIME/frame/referrer/permissions headers are versioned and validated; live TLS/header acceptance remains explicitly unclaimed")
