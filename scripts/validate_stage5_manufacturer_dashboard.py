#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    html=(ROOT/"live/manufacturer.html").read_text(encoding="utf-8")
    js=(ROOT/"assets/csp/manufacturer-inline-1.js").read_text(encoding="utf-8")
    css=(ROOT/"assets/csp/manufacturer.css").read_text(encoding="utf-8")
    vercel=json.loads((ROOT/"vercel.json").read_text(encoding="utf-8"))
    company=(ROOT/"live/company.html").read_text(encoding="utf-8")

    require('data-manufacturer-ready="false"' in html,"manufacturer runtime readiness marker missing")
    require('REAL TENANT DATA · NO DEMO STORAGE' in html,"manufacturer production boundary missing")
    require('PRODUCTION MANUFACTURER · STAGE 5' in html,"Stage 5 product marker missing")
    require('PRODUCTION API' in html and 'REAL TENANT DATA · NO DEMO STORAGE' in html,
            "manufacturer production API boundary missing")

    for token in [
        'const STORAGE="dpp_company_session_v1"',
        'sessionStorage.getItem(STORAGE)',
        'api("/api/organizations")',
        'api("/api/models")',
        'api("/api/items")',
        'api("/api/models",{method:"POST"',
        'api("/api/provision",{method:"POST"',
        'category:model.category',
        '["owner","admin","editor"]',
        'document.body.dataset.manufacturerMode=write?"write":"read_only"',
        'passport_url',
        'qr_url',
    ]:
        require(token in js,f"manufacturer runtime missing: {token}")

    require("localStorage" not in js,"manufacturer dashboard must not keep product data in localStorage")
    require("?sample=1" not in html and "?sample=1" not in js,"manufacturer dashboard must not depend on demo/sample mode")
    require("innerHTML" not in js,"manufacturer dashboard must render backend values without innerHTML injection")

    rewrites={(row.get("source"),row.get("destination")) for row in vercel.get("rewrites",[])}
    require(("/manufacturer","/live/manufacturer") in rewrites,"clean /manufacturer route missing")
    require(("/manufacturer/","/live/manufacturer") in rewrites,"clean /manufacturer/ route missing")
    require('href="/dashboard">Настрой DPP системата' in company,
            "company flow must enter manufacturer onboarding before operations")

    require(".stats" in css and ".list" in css and "@media" in css,"manufacturer responsive styling incomplete")

    print("STAGE5_MANUFACTURER_DASHBOARD_PASS: production company session + active tenant + live models/items + generic battery-category provisioning are wired without demo product storage")

if __name__=="__main__":
    main()
