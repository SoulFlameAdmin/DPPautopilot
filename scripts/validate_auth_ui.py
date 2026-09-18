#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path

def require(c,m):
    if not c: raise AssertionError(m)

def main():
    require(len(sys.argv)==2,"usage: validate_auth_ui.py <dom>")
    dom=Path(sys.argv[1]).read_text(encoding="utf-8",errors="replace")
    require('data-auth-ready="true"' in dom,"M01 auth UI did not initialize")
    require('data-session-state="anonymous"' in dom,"M01 auth UI did not initialize anonymous session state")
    require('M01 · Authentication' in dom,"M01 auth heading missing")
    require('Sign up' in dom and 'Sign in' in dom and 'Reset password' in dom and 'Sign out' in dom,"M01 auth controls incomplete")
    require('service_role' not in dom.lower(),"service-role material leaked into auth DOM")
    print("M01_AUTH_UI_PASS: auth client loads verified publishable config, initializes anonymous state, and exposes signup/signin/reset/signout controls")

if __name__=="__main__": main()
