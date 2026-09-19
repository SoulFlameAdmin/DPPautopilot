#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/security-headers-policy.json").read_text(encoding="utf-8"))
vercel=json.loads((ROOT/"vercel.json").read_text(encoding="utf-8"))

assert policy.get("version")==1
assert policy.get("task")=="R02"
assert policy.get("status")=="partial"
assert policy.get("deployment_config")=="vercel.json"

entries=vercel.get("headers",[])
global_rules=[r for r in entries if r.get("source")=="/(.*)"]
assert len(global_rules)==1, "R02 requires exactly one global header rule"
actual={h["key"]:h["value"] for h in global_rules[0].get("headers",[])}

required=policy.get("global_headers",{})
assert set(actual)==set(required), f"R02 header key drift: {set(actual)!r}"

for key,value in required.items():
    if key=="Content-Security-Policy":
        continue
    assert actual.get(key)==value, f"R02 header mismatch: {key}"

csp=actual.get("Content-Security-Policy","")
assert csp, "R02 CSP missing"
assert "http://" not in csp.lower(), "R02 CSP must not allow plaintext HTTP sources"
assert "'unsafe-eval'" not in csp

directives={}
for part in [x.strip() for x in csp.split(";") if x.strip()]:
    tokens=part.split()
    directives[tokens[0]]=tokens[1:]

csp_policy=required["Content-Security-Policy"]
for name,expected in csp_policy["required_directives"].items():
    assert name in directives, f"R02 CSP missing directive {name}"
    assert directives[name]==expected, f"R02 CSP directive mismatch {name}: {directives[name]}"

assert directives["connect-src"]==[
    "'self'",
    "https://frhletkiuupgksmgxoxc.supabase.co"
], "R02 connect-src must be same-origin + exact bound Supabase endpoint"
assert directives["object-src"]==["'none'"]
assert directives["frame-ancestors"]==["'none'"]
assert directives["upgrade-insecure-requests"]==[]
assert "data:" not in directives["script-src"]
assert "https:" not in directives["script-src"]

assert actual["Strict-Transport-Security"]=="max-age=31536000"
assert actual["X-Content-Type-Options"]=="nosniff"
assert actual["X-Frame-Options"]=="DENY"
assert actual["Referrer-Policy"]=="no-referrer"
assert actual["Permissions-Policy"]=="camera=(), microphone=(), geolocation=(), payment=(), usb=()"

cache=[r for r in entries if r.get("source")==policy["cache_policy"]["path"]]
assert len(cache)==1, "R02 data cache rule missing"
cache_headers={h["key"]:h["value"] for h in cache[0].get("headers",[])}
assert cache_headers.get(policy["cache_policy"]["header"])==policy["cache_policy"]["value"]

tls=policy.get("tls",{})
assert tls.get("runtime_verified") is False
assert "F08" in tls.get("claim","")
assert len(tls.get("required_before_green",[]))>=5
assert any("TLS certificate" in x for x in tls["required_before_green"])
assert any("Live response headers" in x for x in tls["required_before_green"])

gap=csp_policy["known_gap"]
assert "unsafe-inline" in gap
assert "nonce" in gap.lower() or "hash" in gap.lower()

print("R02_SECURITY_HEADERS_POLICY_PASS: exact deploy-time CSP/HSTS/MIME/frame/referrer/permissions controls are versioned; live TLS/header verification remains intentionally unclaimed")
