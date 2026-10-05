#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(c: bool,m: str)->None:
    if not c: raise AssertionError(m)

def main()->None:
    migration=(ROOT/"supabase/migrations/20261005060000_dpp_public_passport_terminal_ux.sql").read_text(encoding="utf-8")
    api=(ROOT/"api/passport.js").read_text(encoding="utf-8")
    api_tests=(ROOT/"tests/api/passport.test.cjs").read_text(encoding="utf-8")
    js=(ROOT/"assets/csp/public-passport-inline-1.js").read_text(encoding="utf-8")
    css=(ROOT/"assets/csp/public-passport.css").read_text(encoding="utf-8")
    html=(ROOT/"live/passport.html").read_text(encoding="utf-8")
    db_test=(ROOT/"tests/db/test_step21_terminal_passport.sql").read_text(encoding="utf-8")
    docs=(ROOT/"docs/STEP21_TERMINAL_PASSPORT_UX.md").read_text(encoding="utf-8")
    master=json.loads((ROOT/"data/scooter-battery-master-100.json").read_text(encoding="utf-8"))

    for token in [
        "public_terminal_state text null",
        "replacement_identifier text null",
        "dpp_api_passport_terminalize",
        "p_terminal_state='replaced'",
        "rp.status='active'",
        "ri.organization_id=v_org",
        "else '{}'::jsonb",
        "grant execute on function public.dpp_api_passport_public(text) to anon,authenticated",
        "grant execute on function public.dpp_api_passport_terminalize(uuid,text,text,timestamptz)",
    ]:
        require(token in migration,f"Step 21 migration missing: {token}")

    for token in [
        "PUBLIC_PASSPORT_STATES",
        "PUBLIC_TERMINAL_STATES",
        "dpp_api_passport_terminalize",
        "publicState === 'active' ? sanitizePublicPayload(value[key]) : {}",
        "replacementIdentifier = body.replacement_identifier.trim()",
    ]:
        require(token in api,f"Step 21 API contract missing: {token}")

    for token in [
        "public GET terminal tombstone preserves lifecycle state but strips payload",
        "PATCH terminalize forwards fail-closed replacement transition",
        "PATCH terminalize rejects replacement identifier for non-replaced states before upstream",
    ]:
        require(token in api_tests,f"Step 21 API test missing: {token}")

    for token in [
        "revoked:{label:'REVOKED'",
        "replaced:{label:'REPLACED'",
        "retired:{label:'RETIRED'",
        "renderTerminal(passport,identifier,publicState)",
        "passport.replacement_identifier",
        "dataset.passportTerminal='true'",
        "dataset.passportPublicState=publicState",
    ]:
        require(token in js,f"Step 21 public renderer missing: {token}")
    require("innerHTML" not in js,"Step 21 renderer must remain DOM/text-only")

    for token in [".status-card.terminal.revoked",".status-card.terminal.replaced",".status-card.terminal.retired",".replacement-id"]:
        require(token in css,f"Step 21 terminal styling missing: {token}")
    require('id="techState"' in html,"Step 21 technical public-state field missing")

    for token in ["STEP21_REVOKED_PASS","STEP21_REPLACED_PASS","STEP21_RETIRED_PASS","STEP21_REPLACEMENT_GUARD_PASS"]:
        require(token in db_test,f"Step 21 DB acceptance missing: {token}")

    for token in ["fail-closed public tombstone","different ACTIVE passport in the same organization","plain suspended passport"]:
        require(token in docs,f"Step 21 docs missing: {token}")

    task=next(t for t in master["tasks"] if t["id"]==21)
    require(task["status"]=="green","Official master point 21 must be GREEN")
    require(master["sequentialProgress"]=={"greenThrough":22,"next":23},"Step 21 closes the sequential prefix through already-GREEN point 22")
    require(master["counts"]=={"green":28,"yellow":45,"red":27,"total":100},"Official master counts drift after Step 21")

    print("STEP21_TERMINAL_PASSPORT_UX_PASS: revoked/replaced/retired identifiers resolve to fail-closed public lifecycle UX with tenant-safe replacement links")

if __name__=="__main__":
    main()
