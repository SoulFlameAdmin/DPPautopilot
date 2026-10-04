#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(c: bool,m: str)->None:
    if not c: raise AssertionError(m)

def main()->None:
    migration=(ROOT/"supabase/migrations/20261004160000_dpp_lmt_passport_activation_gate.sql").read_text(encoding="utf-8")
    passport=(ROOT/"api/passport.js").read_text(encoding="utf-8")
    provision=(ROOT/"api/provision.js").read_text(encoding="utf-8")
    batch=(ROOT/"api/batch-provision.js").read_text(encoding="utf-8")
    db_test=(ROOT/"tests/db/test_lmt_activation_gate_subset.sql").read_text(encoding="utf-8")
    api_test=(ROOT/"tests/api/passport-activation.test.cjs").read_text(encoding="utf-8")
    matrix=json.loads((ROOT/"data/lmt-battery-71-v2.json").read_text(encoding="utf-8"))
    contract=json.loads((ROOT/"data/api-error-contract.json").read_text(encoding="utf-8"))

    for token in [
        "create table if not exists public.dpp_authority_evidence",
        "alter table public.dpp_authority_evidence enable row level security",
        "revoke all on public.dpp_authority_evidence from public,anon,authenticated",
        "create or replace function public.dpp_api_scooter_passport_readiness",
        "create or replace function public.dpp_api_scooter_passport_activate",
        "active transition requires readiness activation route",
        "p_status='active' and v_current_status<>'active'",
        "status<>'draft'",
        "'draft',p_public_payload",
        "'activation_required',true",
        "revoke all on function public.dpp_api_scooter_passport_readiness",
        "revoke all on function public.dpp_api_scooter_passport_activate",
    ]:
        require(token.lower() in migration.lower(),f"Step 18 migration missing: {token}")

    mandatory=[p["number"] for p in matrix["points"] if p["lmtStatusAt2027_02_18"]=="mandatory"]
    conditional=[p["number"] for p in matrix["points"] if p["lmtStatusAt2027_02_18"]=="if_applicable"]
    require(len(mandatory)==50,"Step 18 matrix must still contain 50 mandatory LMT launch points")
    require(set(conditional)=={35,41,57,58,68,69,70,71},"Step 18 conditional point set drift")
    for n in mandatory:
        require(f"array_append(v_missing,{n})" in migration,f"Step 18 DB readiness omits mandatory point {n}")
    for n in conditional:
        require(f"? '{n}'" in migration and f"array_append(v_undecided,{n})" in migration,
                f"Step 18 DB readiness omits conditional decision {n}")

    for token in [
        "validReadinessReport",
        "dpp_api_scooter_passport_readiness",
        "body.action === 'activate'",
        "dpp_api_scooter_passport_activate",
    ]:
        require(token in passport,f"Step 18 passport API missing: {token}")

    require("value.passport_status==='draft'" in provision,"single provisioning must expect DRAFT")
    require("value.activation_required===true" in provision,"single provisioning must require activation flag")
    require("value.passport_status==='draft'" in batch,"batch provisioning must expect DRAFT")
    require("value.activation_required===true" in batch,"batch provisioning must require activation flag")

    for token in [
        "STEP18_LMT_ACTIVATION_GATE_PASS",
        "generic PATCH bypassed activation route",
        "undecided conditional activation was accepted",
        "complete LMT passport did not become ready",
        "activated passport did not become publicly resolvable",
    ]:
        require(token in db_test,f"Step 18 DB acceptance missing: {token}")

    for token in [
        "authenticated readiness GET calls the LMT readiness RPC",
        "PATCH action activate calls only the readiness-gated activation RPC",
        "ACTIVATION_ROUTE_REQUIRED",
        "unknown passport action is rejected locally",
    ]:
        require(token in api_test,f"Step 18 API acceptance missing: {token}")

    passport_errors=contract["surfaces"]["passport"]
    require(passport_errors["DP608"]["code"]=="PASSPORT_INCOMPLETE","DP608 missing")
    require(passport_errors["DP609"]["code"]=="APPLICABILITY_UNDECIDED","DP609 missing")
    require(passport_errors["DP610"]["code"]=="ACTIVATION_ROUTE_REQUIRED","DP610 missing")
    require(passport_errors["DP611"]["code"]=="PASSPORT_STATE_NOT_ACTIVATABLE","DP611 missing")

    print("STEP18_ACTIVATION_GATE_CONTRACT_PASS: provisioning is draft-first; all 50 mandatory and 8 conditional LMT launch points are fail-closed before ACTIVE/public release")

if __name__=="__main__":
    main()
