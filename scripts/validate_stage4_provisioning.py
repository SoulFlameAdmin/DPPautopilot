#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    migration=(ROOT/"supabase/migrations/20261004053000_dpp_scooter_single_item_provisioning.sql").read_text(encoding="utf-8")
    activation=(ROOT/"supabase/migrations/20261004160000_dpp_lmt_passport_activation_gate.sql").read_text(encoding="utf-8")
    api=(ROOT/"api/provision.js").read_text(encoding="utf-8")
    api_test=(ROOT/"tests/api/provision.test.cjs").read_text(encoding="utf-8")
    db_test=(ROOT/"tests/db/test_scooter_provisioning_subset.sql").read_text(encoding="utf-8")
    error_contract=json.loads((ROOT/"data/api-error-contract.json").read_text(encoding="utf-8"))
    observability=json.loads((ROOT/"data/observability-policy.json").read_text(encoding="utf-8"))
    rate_limit=json.loads((ROOT/"data/rate-limit-policy.json").read_text(encoding="utf-8"))

    for token in [
        "create or replace function public.dpp_api_scooter_battery_provision",
        "security definer",
        "dpp_require_active_role(array['owner','admin','editor'])",
        "light_means_of_transport",
        "dpp_assert_public_passport_payload_safe",
        "on conflict (unique_identifier) do nothing",
        "status,public_payload,private_payload,created_by",
        "'idempotent_replay'",
        "revoke all on function public.dpp_api_scooter_battery_provision",
        "grant execute on function public.dpp_api_scooter_battery_provision",
    ]:
        require(token.lower() in migration.lower(), f"Stage 4 migration missing: {token}")

    for token in [
        "startRequestObservability(req,res,'provision')",
        "enforceRateLimit(req,res,'provision')",
        "enforceSharedRateLimit(req,res,'provision'",
        "dpp_api_scooter_battery_provision",
        "findRestrictedPublicPaths",
        "findAuthorityOnlyPaths",
        "passport_url",
        "qr_url",
        "qr_api_url",
        "idempotent_replay?200:201",
    ]:
        require(token in api, f"Stage 4 API missing: {token}")

    for token in [
        "atomically provisions a draft battery passport",
        "identical retry returns the same provisioned identity",
        "public payload must carry the exact individual battery identifier",
        "restricted fields cannot enter public payload",
        "database provisioning conflicts map to stable public errors",
    ]:
        require(token in api_test, f"Stage 4 API test missing: {token}")

    for token in [
        "STAGE4_SINGLE_ITEM_PROVISIONING_PASS",
        "Step18 provisioning did not create a draft passport",
        "Stage4 identical retry was not idempotent",
        "Stage4 divergent identifier retry was not rejected",
        "Stage4 non-LMT model was accepted",
        "Stage4 viewer provisioning was not denied",
        "Stage4 cross-tenant global identifier collision was not rejected",
    ]:
        require(token in db_test, f"Stage 4 DB test missing: {token}")

    provision_errors=error_contract["surfaces"].get("provision",{})
    require(provision_errors.get("DP601",{}).get("code")=="MODEL_NOT_FOUND","Stage 4 DP601 mapping missing")
    require(provision_errors.get("DP604",{}).get("code")=="BATTERY_IDENTIFIER_CONFLICT","Stage 4 DP604 mapping missing")
    require(provision_errors.get("DP605",{}).get("code")=="PASSPORT_CONFLICT","Stage 4 DP605 mapping missing")
    require("provision" in observability["surfaces"],"Stage 4 observability surface missing")
    require(rate_limit["surfaces"].get("provision")=={"POST":"authenticated_write"},"Stage 4 rate-limit policy missing")

    for token in ["status<>'draft'","'draft',p_public_payload","'activation_required',true"]:
        require(token.lower() in activation.lower(),f"Step 18 activation override missing: {token}")
    print("STAGE4_PROVISIONING_CONTRACT_PASS: authenticated atomic LMT item -> DRAFT passport provisioning is idempotent and cannot publish before readiness activation")

if __name__=="__main__":
    main()
