#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CLIENT_ROOTS=[ROOT/"index.html",ROOT/"demo",ROOT/"data"]
FORBIDDEN_IDENTIFIERS=[
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
    "DATABASE_URL",
    "POSTGRES_PASSWORD",
    "REGISTRY_CLIENT_SECRET",
    "WEBHOOK_SIGNING_SECRET",
    "BEGIN PRIVATE KEY",
    "BEGIN RSA PRIVATE KEY",
]
SECRET_PATTERNS=[
    re.compile(r"sk_live_[A-Za-z0-9]{12,}"),
    re.compile(r"postgres(?:ql)?://[^\s:@]+:[^\s@]+@"),
]

def require(c,m):
    if not c: raise AssertionError(m)

auth=json.loads((ROOT/"data/auth-config.json").read_text(encoding="utf-8"))
require(auth["supabaseUrl"].startswith("https://") and auth["supabaseUrl"].endswith(".supabase.co"),"R01 Supabase URL classification/config invalid")
require(auth["publishableKey"].startswith("sb_publishable_"),"R01 client config must use a publishable key")
require("service" not in auth["publishableKey"].lower(),"R01 client config appears to contain a service credential")

for root in CLIENT_ROOTS:
    paths=[root] if root.is_file() else [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in {".html",".js",".json",".css",".svg",".txt"}]
    for path in paths:
        text=path.read_text(encoding="utf-8",errors="ignore")
        rel=path.relative_to(ROOT)
        for token in FORBIDDEN_IDENTIFIERS:
            require(token.lower() not in text.lower(),f"R01 forbidden server-secret identifier/material in client asset {rel}: {token}")
        for pattern in SECRET_PATTERNS:
            require(not pattern.search(text),f"R01 probable secret material in client asset {rel}")

env=(ROOT/".env.example").read_text(encoding="utf-8")
require("DPP_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME" in env,"R01 .env.example public placeholder missing")
for line in env.splitlines():
    if line.startswith("DPP_") and "=" in line:
        key,value=line.split("=",1)
        require("REPLACE" in value or "YOUR_PROJECT" in value,f"R01 .env.example contains non-placeholder value for {key}")

doc=(ROOT/"docs/R01_ENV_SECRET_MANAGEMENT.md").read_text(encoding="utf-8")
for phrase in ["service-role key","server-only secret store","publishable key","frhletkiuupgksmgxoxc","F08 remains externally blocked"]:
    require(phrase.lower() in doc.lower(),f"R01 documentation missing: {phrase}")

print("R01_ENV_SECRET_PASS: client assets contain only classified public Supabase configuration; server-secret identifiers/material are absent and environment placeholders are explicit")
