#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
policy = json.loads((ROOT / "data/security-headers-policy.json").read_text(encoding="utf-8"))
vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))

assert policy.get("version") == 2
assert policy.get("task") == "R02"
assert policy.get("status") in {"partial", "green"}
assert policy.get("deployment_config") == "vercel.json"

entries = vercel.get("headers", [])
global_rules = [r for r in entries if r.get("source") == "/(.*)"]
assert len(global_rules) == 1, "R02 requires exactly one global header rule"
actual = {h["key"]: h["value"] for h in global_rules[0].get("headers", [])}
required = policy.get("global_headers", {})
assert set(actual) == set(required), f"R02 header key drift: {set(actual)!r}"

for key, value in required.items():
    if key != "Content-Security-Policy":
        assert actual.get(key) == value, f"R02 header mismatch: {key}"

csp = actual.get("Content-Security-Policy", "")
assert csp, "R02 CSP missing"
csp_policy = required["Content-Security-Policy"]
for forbidden in csp_policy.get("forbidden_tokens", []):
    assert forbidden.lower() not in csp.lower(), f"R02 CSP forbidden token present: {forbidden}"

directives = {}
for part in [x.strip() for x in csp.split(";") if x.strip()]:
    tokens = part.split()
    directives[tokens[0]] = tokens[1:]
for name, expected in csp_policy["required_directives"].items():
    assert name in directives, f"R02 CSP missing directive {name}"
    assert directives[name] == expected, f"R02 CSP directive mismatch {name}: {directives[name]}"

assert directives["script-src"] == ["'self'"]
assert directives["script-src-attr"] == ["'none'"]
assert directives["style-src"] == ["'self'"]
assert directives["style-src-attr"] == ["'none'"]
assert directives["connect-src"] == ["'self'", "https://frhletkiuupgksmgxoxc.supabase.co"]
assert directives["object-src"] == ["'none'"]
assert directives["frame-ancestors"] == ["'none'"]
assert directives["upgrade-insecure-requests"] == []

assert actual["Strict-Transport-Security"] == "max-age=31536000"
assert actual["X-Content-Type-Options"] == "nosniff"
assert actual["X-Frame-Options"] == "DENY"
assert actual["Referrer-Policy"] == "no-referrer"
assert actual["Permissions-Policy"] == "camera=(), microphone=(), geolocation=(), payment=(), usb=()"

cache = [r for r in entries if r.get("source") == policy["cache_policy"]["path"]]
assert len(cache) == 1, "R02 data cache rule missing"
cache_headers = {h["key"]: h["value"] for h in cache[0].get("headers", [])}
assert cache_headers.get(policy["cache_policy"]["header"]) == policy["cache_policy"]["value"]

inline = csp_policy["inline_code_policy"]
assert inline == {
    "inline_script_elements": False,
    "inline_style_elements": False,
    "event_handler_attributes": False,
    "style_attributes": False,
    "dynamic_style_writes": False,
}

html_files = [ROOT / "index.html", *sorted((ROOT / "demo").glob("*.html"))]
inline_script = re.compile(r"<script\\b(?![^>]*\\bsrc\\s*=)[^>]*>", re.I)
inline_style = re.compile(r"<style\\b", re.I)
event_attr = re.compile(r"\\son[a-z]+\\s*=", re.I)
style_attr = re.compile(r"\\sstyle\\s*=", re.I)
asset_ref = re.compile(r"""(?:src|href)=["'](/assets/csp/[^"']+)["']""", re.I)

referenced_assets = set()
for html_path in html_files:
    source = html_path.read_text(encoding="utf-8")
    assert not inline_script.search(source), f"R02 inline script remains: {html_path.relative_to(ROOT)}"
    assert not inline_style.search(source), f"R02 inline style remains: {html_path.relative_to(ROOT)}"
    assert not event_attr.search(source), f"R02 event handler attribute remains: {html_path.relative_to(ROOT)}"
    assert not style_attr.search(source), f"R02 style attribute remains: {html_path.relative_to(ROOT)}"
    for match in asset_ref.finditer(source):
        referenced_assets.add(ROOT / match.group(1).lstrip("/"))

assert referenced_assets, "R02 extracted CSP assets are not referenced"
for asset in referenced_assets:
    assert asset.is_file(), f"R02 referenced CSP asset missing: {asset.relative_to(ROOT)}"

client_js = [*sorted((ROOT / "demo").glob("*.js")), *sorted((ROOT / "assets/csp").glob("*.js"))]
dynamic_style = re.compile(r"\\.style(?:\\.|\\s*=)|setAttribute\\(\\s*['\"]style|createElement\\(\\s*['\"]style", re.I)
for js_path in client_js:
    source = js_path.read_text(encoding="utf-8")
    assert not dynamic_style.search(source), f"R02 dynamic inline style write remains: {js_path.relative_to(ROOT)}"

tls = policy.get("tls", {})
assert len(tls.get("required_before_green", [])) >= 6
assert any("TLS certificate" in x for x in tls["required_before_green"])
assert any("Live response headers" in x for x in tls["required_before_green"])
if policy["status"] == "green":
    assert tls.get("runtime_verified") is True
else:
    assert tls.get("runtime_verified") is False

print("R02_SECURITY_HEADERS_POLICY_PASS: CSP v2 forbids unsafe-inline/unsafe-eval, browser surfaces are de-inlined, script/style attributes are denied, and header/cache policy is consistent")
