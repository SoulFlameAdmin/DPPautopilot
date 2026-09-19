#!/usr/bin/env python3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/"demo/auth-recovery.html").read_text(encoding="utf-8")

def require(c,m):
    if not c: raise AssertionError(m)

for snippet in [
    "method:'PATCH'",
    "/auth/v1/user",
    "data-recovery-ready",
    "data-recovery-session",
    "data-password-update",
    "history.replaceState",
    "Recovery token cleared from the URL",
]:
    require(snippet in html,f"M01 recovery completion contract missing: {snippet}")

require("localStorage" not in html and "sessionStorage" not in html,"M01 recovery token must not be persisted")
require("service_role" not in html.lower(),"M01 recovery page must not contain service-role material")
require("accessToken=null" in html,"M01 recovery token must be cleared after password update")
require("h.type==='recovery'" in html,"R06 recovery page must require recovery type")
require("expiresAt*1000>Date.now()" in html,"R06 recovery page must reject expired recovery sessions")
require('<meta name="referrer" content="no-referrer">' in html,"R06 recovery page must set no-referrer policy")
require(html.index("const h=parseHash()") < html.index("fetch('/data/auth-config.json'"),"R06 recovery fragment must be parsed before any config network request")
require(html.index("history.replaceState") < html.index("fetch('/data/auth-config.json'"),"R06 recovery fragment must be scrubbed before any config network request")
require(html.index("history.replaceState") < html.index("save.onclick"),"R06 recovery fragment must be cleared during init before password submission")
print("M01_RECOVERY_CONTRACT_PASS: recovery fragment is synchronously parsed and scrubbed before network I/O, password update uses authenticated PATCH /auth/v1/user, and token is cleared without persistence")
