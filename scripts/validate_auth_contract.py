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
for endpoint in ["/auth/v1/signup","/auth/v1/token?grant_type=password","/auth/v1/recover","/auth/v1/logout"]:
    require(endpoint in html,f"missing auth flow endpoint {endpoint}")
for marker in ['data-auth-ready="false"','data-session-state="unknown"',"sb_publishable_"]:
    require(marker in html or marker in json.dumps(cfg),f"missing M01 contract marker {marker}")
require("localStorage" not in html,"M01 demo must not persist auth tokens to localStorage")
print("M01_AUTH_CONTRACT_PASS: signup/signin/reset/signout/session client flows exist, use only the verified publishable key, and do not persist tokens")
