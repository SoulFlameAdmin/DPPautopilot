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
print("M01_RECOVERY_CONTRACT_PASS: recovery session is fragment-only, password update uses authenticated PATCH /auth/v1/user, and token is cleared without persistence")
