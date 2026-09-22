#!/usr/bin/env python3
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(c,m):
    if not c: raise AssertionError(m)

def read_surface(rel):
    html=(ROOT/rel).read_text(encoding="utf-8")
    parts=[html]
    for src in re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>',html,re.I):
        if src.startswith("/") and not src.startswith("//"):
            path=ROOT/src.lstrip("/")
            require(path.is_file(),f"M01 recovery local script missing: {src}")
            parts.append(path.read_text(encoding="utf-8"))
    return html,"\n".join(parts)

html,code=read_surface("demo/auth-recovery.html")

for snippet in [
    "method:'PATCH'",
    "/auth/v1/user",
    "data-recovery-ready",
    "data-recovery-session",
    "data-password-update",
    "history.replaceState",
    "Recovery token cleared from the URL",
    "AUTH_REQUEST_TIMEOUT_MS=15000",
    "new AbortController()",
    "signal:controller.signal",
    "clearTimeout(timeout)",
    "Password update timed out. Please try again.",
]:
    require(snippet in code,f"M01 recovery completion contract missing: {snippet}")

require("localStorage" not in code and "sessionStorage" not in code,"M01 recovery token must not be persisted")
require("service_role" not in code.lower(),"M01 recovery page must not contain service-role material")
require("accessToken=null" in code,"M01 recovery token must be cleared after password update")
require("cfg.supabaseUrl!=='https://frhletkiuupgksmgxoxc.supabase.co'" in code,"M01 recovery page must pin the bound Supabase project before token use")
require("startsWith('sb_publishable_')" in code,"M01 recovery page must require a modern publishable key before token use")
require("accessToken=null;cfg=null;document.body.dataset.recoverySession='missing'" in code,"M01 recovery init failure must clear in-memory token/config and fail closed")
require("h.type==='recovery'" in code,"R06 recovery page must require recovery type")
require("expiresAt*1000>Date.now()" in code,"R06 recovery page must reject expired recovery sessions")
require('<meta name="referrer" content="no-referrer">' in html,"R06 recovery page must set no-referrer policy")
require(code.index("const h=parseHash()") < code.index("fetch('/data/auth-config.json'"),"R06 recovery fragment must be parsed before any config network request")
require(code.index("history.replaceState") < code.index("fetch('/data/auth-config.json'"),"R06 recovery fragment must be scrubbed before any config network request")
require(code.index("history.replaceState") < code.index("save.onclick"),"R06 recovery fragment must be cleared during init before password submission")
print("M01_RECOVERY_CONTRACT_PASS: recovery fragment is synchronously parsed and scrubbed before network I/O, bound Supabase config is pinned before token use, password update uses a bounded authenticated PATCH /auth/v1/user with deterministic timeout cleanup, and any init failure clears in-memory recovery state")
