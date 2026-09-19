#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
cfg=json.loads((ROOT/"data/auth-config.json").read_text(encoding="utf-8"))
html=(ROOT/"demo/auth.html").read_text(encoding="utf-8")

def require(c,m):
    if not c: raise AssertionError(m)

require(cfg["supabaseUrl"]=="https://frhletkiuupgksmgxoxc.supabase.co","wrong Supabase project URL")
require(cfg["publishableKey"].startswith("sb_publishable_"),"M01 must use modern publishable key")
require("service_role" not in json.dumps(cfg).lower(),"service role must never be in client config")
require(cfg["authSettingsEvidence"]["emailSignup"] is True,"email signup evidence missing")
require(cfg["authSettingsEvidence"]["mailerAutoconfirm"] is False,"confirmation requirement evidence missing")
for endpoint in ["/auth/v1/signup","/auth/v1/token?grant_type=password","/auth/v1/token?grant_type=refresh_token","/auth/v1/recover","/auth/v1/logout"]:
    require(endpoint in html,f"missing auth flow endpoint {endpoint}")
for marker in ['data-auth-ready="false"','data-session-state="unknown"',"sb_publishable_"]:
    require(marker in html or marker in json.dumps(cfg),f"missing M01 contract marker {marker}")
require("localStorage" not in html and "sessionStorage" not in html,"M01 demo must not persist auth tokens")
require("body:{refresh_token:refreshToken}" in html,"M01 refresh flow must submit only the in-memory refresh token")
require("async function refreshSession()" in html and "if(!refreshToken)return false" in html,"M01 refresh flow must fail closed when no refresh token is available")
require("setSession(d)" in html and "setSession(null)" in html,"M01 refresh flow must rotate success and clear failed sessions through setSession")
require("setTimeout(refreshSession,refreshAfter)" in html,"M01 authenticated sessions must schedule refresh before expiry")
require("clearTimeout(refreshTimer)" in html,"M01 session replacement/signout must clear stale refresh timers")
require("new URL('/demo/auth-recovery.html',location.origin).href" in html,"R06 recovery redirect must be fixed same-origin")
require("redirect_to='+encodeURIComponent(redirectTo)" in html,"R06 recovery redirect must be URL-encoded")
require("If the account is eligible, a password reset email will be sent." in html,"R06 reset response must be account-enumeration resistant")
require('<meta name="referrer" content="no-referrer">' in html,"R06 auth page must set no-referrer policy")
print("M01_AUTH_CONTRACT_PASS: signup/signin/refresh/reset/signout session flows exist, refresh rotation stays in memory, the verified publishable key is used, and tokens are not persisted")
