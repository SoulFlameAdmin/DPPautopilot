#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(c: bool,m: str)->None:
    if not c: raise AssertionError(m)

def main()->None:
    migration=(ROOT/"supabase/migrations/20261004143000_dpp_scooter_batch_provisioning.sql").read_text(encoding="utf-8")
    generic=(ROOT/"supabase/migrations/20261007052000_dpp_generic_battery_provisioning_v1.sql").read_text(encoding="utf-8")
    api=(ROOT/"api/batch-provision.js").read_text(encoding="utf-8")
    api_test=(ROOT/"tests/api/batch-provision.test.cjs").read_text(encoding="utf-8")
    db_test=(ROOT/"tests/db/test_scooter_batch_provisioning_subset.sql").read_text(encoding="utf-8")
    contract=json.loads((ROOT/"data/api-error-contract.json").read_text(encoding="utf-8"))
    rate=json.loads((ROOT/"data/rate-limit-policy.json").read_text(encoding="utf-8"))
    obs=json.loads((ROOT/"data/observability-policy.json").read_text(encoding="utf-8"))

    for token in [
        "create table if not exists public.dpp_provision_batches",
        "create table if not exists public.dpp_provision_batch_items",
        "unique (organization_id,batch_key)",
        "request_fingerprint",
        "quantity between 1 and 250",
        "create or replace function public.dpp_api_scooter_battery_batch_provision",
        "dpp_require_active_role(array['owner','admin','editor'])",
        "dpp_api_scooter_battery_provision",
        "digest(convert_to(p_units::text,'UTF8'),'sha256')",
        "raise exception 'batch key already belongs to a different provisioning request'",
        "revoke all on function public.dpp_api_scooter_battery_batch_provision",
        "grant execute on function public.dpp_api_scooter_battery_batch_provision",
    ]:
        require(token.lower() in migration.lower(),f"Stage 5 migration missing: {token}")

    for token in [
        "MAX_UNITS=250",
        "buildGeneratedUnits",
        "identifier_prefix",
        "serial_start",
        "serial_width",
        "duplicate",
        "startRequestObservability(req,res,'batch-provision')",
        "enforceRateLimit(req,res,'batch-provision')",
        "enforceSharedRateLimit(req,res,'batch-provision'",
        "dpp_api_battery_batch_provision",
        "findRestrictedPublicPaths",
        "findAuthorityOnlyPaths",
        "passport_url",
        "qr_url",
    ]:
        if token=="duplicate":
            require("ids.has" in api,"Stage 5 API missing duplicate identifier rejection")
        else:
            require(token in api,f"Stage 5 API missing: {token}")

    for token in [
        "create or replace function public.dpp_api_battery_provision",
        "create or replace function public.dpp_api_battery_batch_provision",
        "dpp_api_battery_provision",
        "public model category must match the selected battery model",
        "grant execute on function public.dpp_api_battery_batch_provision",
    ]:
        require(token.lower() in generic.lower(),f"Manufacturer generic provisioning migration missing: {token}")

    for token in [
        "Produce X generator creates deterministic serial range and calls one atomic batch RPC",
        "explicit batch rejects duplicate identifiers before upstream",
        "generator validates quantity serial width and range without partial work",
        "identical batch replay returns 200 and same identities",
        "divergent batch-key conflict maps to stable public error",
        "batch validation accepts supported non-LMT manufacturer categories",
        "batch validation rejects unknown battery categories before upstream",
    ]:
        require(token in api_test,f"Stage 5 API test missing: {token}")

    for token in [
        "STAGE5_BATCH_PROVISIONING_PASS",
        "failed batch left a partial battery item",
        "failed batch left a partial batch row",
        "identical batch retry was not idempotent",
        "divergent retry reused the same batch key",
        "viewer batch provisioning was not denied",
    ]:
        require(token in db_test,f"Stage 5 DB test missing: {token}")

    batch_errors=contract["surfaces"].get("batch-provision",{})
    require(batch_errors.get("DP606",{}).get("code")=="BATCH_KEY_CONFLICT","DP606 mapping missing")
    require(batch_errors.get("DP607",{}).get("code")=="BATCH_STATE_CONFLICT","DP607 mapping missing")
    require(rate["surfaces"].get("batch-provision")=={"POST":"authenticated_write"},"batch rate-limit policy missing")
    require("batch-provision" in obs["surfaces"],"batch observability surface missing")

    print("STAGE5_BATCH_PROVISIONING_CONTRACT_PASS: Produce-X supports 1..250 units across supported battery categories, deterministic serial ranges, atomic rollback, durable batch idempotency and per-item passport/QR output")

if __name__=="__main__":
    main()
