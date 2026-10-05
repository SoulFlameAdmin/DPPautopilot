#!/usr/bin/env python3
from __future__ import annotations
import json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(c: bool,m: str)->None:
    if not c: raise AssertionError(m)

def main()->None:
    html=(ROOT/"live/passport.html").read_text(encoding="utf-8")
    js=(ROOT/"assets/csp/public-passport-inline-1.js").read_text(encoding="utf-8")
    css=(ROOT/"assets/csp/public-passport.css").read_text(encoding="utf-8")
    matrix=json.loads((ROOT/"data/lmt-battery-71-v2.json").read_text(encoding="utf-8"))
    master=json.loads((ROOT/"data/scooter-battery-master-100.json").read_text(encoding="utf-8"))
    api=(ROOT/"api/passport.js").read_text(encoding="utf-8")
    api_tests=(ROOT/"tests/api/passport.test.cjs").read_text(encoding="utf-8")
    docs=(ROOT/"docs/STEP20_PUBLIC_PASSPORT_UX.md").read_text(encoding="utf-8")
    vercel=json.loads((ROOT/"vercel.json").read_text(encoding="utf-8"))

    for token in [
        'data-passport-source="live-api"',
        'id="trustStrip"',
        'id="sectionNav"',
        'id="passportSections"',
        'id="technicalPanel"',
        'id="techIdentifier"',
        'id="techPassportId"',
        'id="techUpdated"',
        'Public data only',
        'EU traceability',
        'не е самостоятелна правна сертификация',
        '/assets/csp/public-passport.css',
        '/assets/csp/public-passport-inline-1.js',
    ]:
        require(token in html,f"Step 20 public page missing: {token}")

    for token in [
        "PUBLIC_ACCESS=new Set(['public','public_identifier','public_identifier_or_operator_identity'])",
        "fetch('/api/passport?identifier='",
        "fetch('/data/lmt-battery-71-v2.json'",
        "point.sourceOwner==='derived_duplicate'",
        "point.number===1",
        "dataset.publicFieldCount",
        "dataset.passportStatus='active'",
        "dataset.restrictedLeak='false'",
        "PUBLIC_PASSPORT_NOT_FOUND",
        "navigator.clipboard.writeText",
        "Intl.DateTimeFormat('bg-BG'",
    ]:
        require(token in js,f"Step 20 renderer missing: {token}")

    for forbidden in [
        "restricted_composition",
        "compliance_test_reports",
        "state_of_health",
        "performance_history",
        "telemetry.environment",
        "telemetry.state_of_charge",
    ]:
        require(forbidden not in js,f"Step 20 client hard-coded restricted field: {forbidden}")

    require(".style." not in js and ".style=" not in js,"Step 20 must not write inline styles")
    require("innerHTML" not in js,"Step 20 renderer must use DOM/text APIs, not dynamic innerHTML")

    for token in [
        ".field-grid",
        ".status-card",
        ".trust-strip",
        ".technical-grid",
        "@media(max-width:820px)",
        "@media(max-width:560px)",
        "[hidden]{display:none!important}",
    ]:
        require(token in css,f"Step 20 stylesheet missing: {token}")

    public_points=[
        p for p in matrix["points"]
        if p.get("access") in {"public","public_identifier","public_identifier_or_operator_identity"}
        and p.get("sourceOwner")!="derived_duplicate"
    ]
    require(len(public_points)>=30,"Step 20 matrix public surface unexpectedly small")
    require(any(p["number"]==1 for p in public_points),"Step 20 matrix missing public unique identifier")
    require(any(p["number"]==43 for p in public_points),"Step 20 matrix missing public waste information")

    require("function sanitizePublicPassport" in api and "sanitizePublicPayload(value[key])" in api,"Step 20 server public projection sanitizer missing")
    require("public GET strips catalog-restricted nested fields even if upstream regresses" in api_tests,
            "Step 20 API regression proof for restricted public leakage missing")
    require("POST rejects restricted public fields before upstream access" in api_tests,
            "Step 20 restricted public write guard proof missing")

    rewrites={(r.get("source"),r.get("destination")) for r in vercel.get("rewrites",[])}
    require(("/passport","/live/passport") in rewrites,"Step 20 canonical /passport route missing")

    for token in ["readable on phone and desktop","second allowlist","not legal certification","#76 final BG/EN bilingual passport"]:
        require(token in docs,f"Step 20 acceptance doc missing: {token}")

    task=next(t for t in master["tasks"] if t["id"]==20)
    require(task["status"]=="green","Official master point 20 must remain GREEN")
    progress=master["sequentialProgress"]
    require(progress["greenThrough"]>=20 and progress["next"]==progress["greenThrough"]+1,
            "Official master may advance beyond Step 20 but cannot regress below it")
    require(master["counts"]["green"]>=27 and master["counts"]["total"]==100,
            "Official master counts regressed below Step 20")

    print("STEP20_PUBLIC_PASSPORT_UX_PASS: ACTIVE public passport is human-readable, EU-traceable, responsive and double-allowlisted against restricted data")

if __name__=="__main__":
    main()
