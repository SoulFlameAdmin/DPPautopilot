#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
cfg=json.loads((ROOT/"data/auth-config.json").read_text(encoding="utf-8"))

def require(c,m):
    if not c: raise AssertionError(m)

def read_surface(rel):
    html=(ROOT/rel).read_text(encoding="utf-8")
    parts=[html]
    for src in re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>',html,re.I):
        if src.startswith("/") and not src.startswith("//"):
            path=ROOT/src.lstrip("/")
            require(path.is_file(),f"M01 local script missing: {src}")
            parts.append(path.read_text(encoding="utf-8"))
    return html,"\n".join(parts)

html,code=read_surface("demo/auth.html")

require(cfg["supabaseUrl"]=="https://frhletkiuupgksmgxoxc.supabase.co","wrong Supabase project URL")
require("cfg.supabaseUrl!=='https://frhletkiuupgksmgxoxc.supabase.co'" in code,"M01 auth page must pin the bound Supabase project before auth calls")
require("String(cfg.publishableKey||'').startsWith('sb_publishable_')" in code,"M01 auth page must require a modern publishable key before auth calls")
require("cfg=null;setSession(null);document.body.dataset.authReady='false'" in code,"M01 auth init failure must clear config/session and remain not-ready")
require(cfg["publishableKey"].startswith("sb_publishable_"),"M01 must use modern publishable key")
require("service_role" not in json.dumps(cfg).lower(),"service role must never be in client config")
require(cfg["authSettingsEvidence"]["emailSignup"] is True,"email signup evidence missing")
require(cfg["authSettingsEvidence"]["mailerAutoconfirm"] is False,"confirmation requirement evidence missing")
for endpoint in ["/auth/v1/signup","/auth/v1/token?grant_type=password","/auth/v1/token?grant_type=refresh_token","/auth/v1/recover","/auth/v1/logout"]:
    require(endpoint in code,f"missing auth flow endpoint {endpoint}")
for marker in ['data-auth-ready="false"','data-session-state="unknown"',"sb_publishable_"]:
    require(marker in code or marker in json.dumps(cfg),f"missing M01 contract marker {marker}")
require("localStorage" not in code and "sessionStorage" not in code,"M01 demo must not persist auth tokens")
require("body:{refresh_token:refreshToken}" in code,"M01 refresh flow must submit only the in-memory refresh token")
require("async function refreshSession()" in code and "if(!refreshToken)return false" in code,"M01 refresh flow must fail closed when no refresh token is available")
require("setSession(d)" in code and "setSession(null)" in code,"M01 refresh flow must rotate success and clear failed sessions through setSession")
require("setTimeout(refreshSession,refreshAfter)" in code,"M01 authenticated sessions must schedule refresh before expiry")
require("function refreshDelayMs(expiresIn)" in code,"M01 refresh scheduler helper missing")
require("Math.min(60000,Math.max(1000,Math.floor(ttlMs*0.1)))" in code,"M01 refresh scheduler must use bounded proportional lead time")
require("return Math.max(1000,ttlMs-leadMs)" in code,"M01 refresh scheduler must schedule from TTL minus bounded lead")
require("Math.max(1000,(expiresIn-60)*1000)" not in code,"M01 refresh scheduler must not use fixed 60-second lead that can create 1-second refresh loops")
require("clearTimeout(refreshTimer)" in code,"M01 session replacement/signout must clear stale refresh timers")
require("AUTH_REQUEST_TIMEOUT_MS=15000" in code,"M01 auth requests must have a deterministic timeout")
require("new AbortController()" in code and "signal:controller.signal" in code,"M01 auth requests must be abortable")
require("clearTimeout(timeout)" in code,"M01 auth request timeout must be cleared after completion")
require("Authentication request timed out. Please try again." in code,"M01 auth timeout must expose a stable retryable error")
require("if(!cfg) throw new Error('auth client is not ready')" in code,"M01 auth calls must fail closed before client initialization")
require("new URL('/demo/auth-recovery.html',location.origin).href" in code,"R06 recovery redirect must be fixed same-origin")
require("redirect_to='+encodeURIComponent(redirectTo)" in code,"R06 recovery redirect must be URL-encoded")
require("If the account is eligible, a password reset email will be sent." in code,"R06 reset response must be account-enumeration resistant")
require('<meta name="referrer" content="no-referrer">' in html,"R06 auth page must set no-referrer policy")
print("M01_AUTH_CONTRACT_PASS: signup/signin/refresh/reset/signout session flows exist, auth is pinned to the bound Supabase project, init failure clears config/session, refresh rotation stays in memory with bounded TTL-aware scheduling, auth calls fail closed before initialization, requests are timeout-bounded, and tokens are not persisted")
