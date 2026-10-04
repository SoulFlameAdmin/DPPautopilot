#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(c: bool,m: str)->None:
    if not c: raise AssertionError(m)

def main()->None:
    migration=(ROOT/"supabase/migrations/20261005001000_dpp_lmt_completeness_workflow.sql").read_text(encoding="utf-8")
    api=(ROOT/"api/passport.js").read_text(encoding="utf-8")
    page=(ROOT/"live/completeness.html").read_text(encoding="utf-8")
    js=(ROOT/"assets/csp/manufacturer-completeness-inline-1.js").read_text(encoding="utf-8")
    manufacturer=(ROOT/"assets/csp/manufacturer-inline-1.js").read_text(encoding="utf-8")
    vercel=json.loads((ROOT/"vercel.json").read_text(encoding="utf-8"))
    master=json.loads((ROOT/"data/scooter-battery-master-100.json").read_text(encoding="utf-8"))
    api_test=(ROOT/"tests/api/completeness-workflow.test.cjs").read_text(encoding="utf-8")
    db_test=(ROOT/"tests/db/test_step19_completeness_workflow_subset.sql").read_text(encoding="utf-8")

    for token in [
        "create or replace function public.dpp_api_scooter_completeness_by_identifier",
        "dpp_require_active_role(array['owner','admin','editor','viewer'])",
        "workflow_score_percent",
        "passport_updated_at",
        "create or replace function public.dpp_api_scooter_authority_evidence_submit",
        "dpp_require_active_role(array['owner','admin','editor'])",
        "only launch authority-evidence field 50",
        "revoke all on function public.dpp_api_scooter_completeness_by_identifier",
        "revoke all on function public.dpp_api_scooter_authority_evidence_submit",
    ]:
        require(token.lower() in migration.lower(),f"Step 19 migration missing: {token}")

    for token in [
        "validCompletenessReport",
        "dpp_api_scooter_completeness_by_identifier",
        "submit_authority_evidence",
        "dpp_api_scooter_authority_evidence_submit",
    ]:
        require(token in api,f"Step 19 API missing: {token}")

    for token in [
        'id="scoreValue"',
        'id="missingList"',
        'id="undecidedList"',
        'id="activatePassport"',
        'id="publicPassport"',
    ]:
        require(token in page,f"Step 19 production page missing: {token}")

    for token in [
        'api("/api/passport?identifier="+encodeURIComponent(identifier)+"&readiness=1")',
        'api("/api/models")',
        'api("/api/items")',
        'submit_authority_evidence',
        'point_applicability',
        'action:"activate"',
        'structuredClone',
    ]:
        require(token in js,f"Step 19 browser workflow missing: {token}")
    require("localStorage" not in js,"Step 19 must not use localStorage as product data")
    require("/manufacturer/completeness?identifier=" in manufacturer,"Manufacturer item list must link completeness workflow")

    rewrites={(r.get("source"),r.get("destination")) for r in vercel.get("rewrites",[])}
    require(("/manufacturer/completeness","/live/completeness") in rewrites,"Step 19 clean route missing")

    for token in [
        "authenticated readiness by identifier uses production completeness RPC",
        "field-50 evidence submission is write-only",
        "malformed completeness response fails closed",
    ]:
        require(token in api_test,f"Step 19 API acceptance missing: {token}")
    for token in [
        "STEP19_COMPLETENESS_WORKFLOW_PASS",
        "field 50 must be reported missing before evidence",
        "cross-tenant identifier read was not denied",
        "viewer wrote authority evidence",
    ]:
        require(token in db_test,f"Step 19 DB acceptance missing: {token}")

    task=next(t for t in master["tasks"] if t["id"]==19)
    require(task["status"]=="green","Official master point 19 must be GREEN only with this acceptance contract")
    require(master["sequentialProgress"]=={"greenThrough":19,"next":20},"Official master must advance to point 20")
    require(master["counts"]["green"]==26 and master["counts"]["yellow"]==47 and master["counts"]["red"]==27,"Official master counts drift after Step 19")

    print("STEP19_COMPLETENESS_WORKFLOW_CONTRACT_PASS: real tenant readiness score, actionable missing fields, conditional decisions, write-only authority evidence and gated activation are wired")

if __name__=="__main__":
    main()
