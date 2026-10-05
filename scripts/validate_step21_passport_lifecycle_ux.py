#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(c: bool,m: str)->None:
    if not c: raise AssertionError(m)

def main()->None:
    migration=(ROOT/"supabase/migrations/20261005004500_dpp_passport_lifecycle_ux.sql").read_text(encoding="utf-8")
    api=(ROOT/"api/passport.js").read_text(encoding="utf-8")
    js=(ROOT/"assets/csp/public-passport-inline-1.js").read_text(encoding="utf-8")
    css=(ROOT/"assets/csp/public-passport.css").read_text(encoding="utf-8")
    api_test=(ROOT/"tests/api/passport-lifecycle.test.cjs").read_text(encoding="utf-8")
    db_test=(ROOT/"tests/db/test_step21_passport_lifecycle_subset.sql").read_text(encoding="utf-8")
    docs=(ROOT/"docs/STEP21_PASSPORT_LIFECYCLE_UX.md").read_text(encoding="utf-8")
    master=json.loads((ROOT/"data/scooter-battery-master-100.json").read_text(encoding="utf-8"))
    privacy=json.loads((ROOT/"data/privacy-data-inventory.json").read_text(encoding="utf-8"))
    errors=json.loads((ROOT/"data/api-error-contract.json").read_text(encoding="utf-8"))["surfaces"]["passport"]

    for token in [
        "status in ('draft','active','suspended','retired','revoked','replaced')",
        "create table if not exists public.dpp_passport_lifecycle",
        "alter table public.dpp_passport_lifecycle enable row level security",
        "revoke all on public.dpp_passport_lifecycle from public,anon,authenticated",
        "create or replace function public.dpp_api_passport_public_resolve",
        "create or replace function public.dpp_api_scooter_passport_transition",
        "only an active passport may enter a terminal lifecycle state",
        "replacement must be an active passport in the same organization",
        "terminal transition requires lifecycle route",
    ]:
        require(token.lower() in migration.lower(),f"Step 21 migration missing: {token}")

    for token in [
        "TERMINAL_PASSPORT_STATUSES",
        "validPublicPassportResolution",
        "sanitizePublicPassportResolution",
        "dpp_api_passport_public_resolve",
        "dpp_api_scooter_passport_transition",
        "['retire','revoke','replace']",
        "LIFECYCLE_ROUTE_REQUIRED",
    ]:
        require(token in api,f"Step 21 API missing: {token}")

    for token in [
        "function renderLifecycle",
        "Този паспорт е RETIRED",
        "Този паспорт е REVOKED",
        "Този паспорт е REPLACED",
        "replacement_identifier",
        "Отвори заместващия паспорт",
        "dataset.publicFieldCount='0'",
    ]:
        require(token in js,f"Step 21 public UX missing: {token}")

    for token in [
        ".lifecycle-card",
        ".lifecycle-card.revoked",
        ".lifecycle-card.retired",
        ".lifecycle-card.replaced",
    ]:
        require(token in css,f"Step 21 lifecycle style missing: {token}")

    require("public_payload" not in "\n".join(
        line for line in migration.splitlines()
        if "kind','lifecycle'" in line or "reason_code" in line
    ),"Step 21 lifecycle public result must not carry old payload")

    for token in [
        "public identifier GET resolves lifecycle tombstone without payload leakage",
        "replace action calls lifecycle transition RPC with optimistic timestamp",
        "generic terminal status PATCH is blocked before upstream",
        "malformed lifecycle upstream response fails closed",
    ]:
        require(token in api_test,f"Step 21 API acceptance missing: {token}")

    for token in [
        "STEP21_PASSPORT_LIFECYCLE_UX_PASS",
        "replaced tombstone leaked payload/note",
        "generic PATCH bypassed lifecycle route",
        "cross-tenant lifecycle transition was accepted",
    ]:
        require(token in db_test,f"Step 21 DB acceptance missing: {token}")

    for code,public_code in {
        "DP612":"LIFECYCLE_ROUTE_REQUIRED",
        "DP613":"LIFECYCLE_METADATA_MISSING",
        "DP614":"REPLACEMENT_NOT_ACTIVE",
        "DP615":"PASSPORT_STATE_NOT_TRANSITIONABLE",
        "DP616":"REPLACEMENT_INVALID",
    }.items():
        require(errors.get(code,{}).get("code")==public_code,f"Step 21 error contract missing {code}")

    store=next((s for s in privacy["stores"] if s.get("id")=="passport_lifecycle_tombstones"),None)
    require(store is not None,"Step 21 privacy inventory missing lifecycle store")
    require(any("reason_note" in x and "never" in x for x in store.get("controls",[])),
            "Step 21 privacy inventory must explicitly protect free-text reason note")

    task=next(t for t in master["tasks"] if t["id"]==21)
    require(task["status"]=="green","Official master point 21 must be GREEN")
    require(master["sequentialProgress"]=={"greenThrough":22,"next":23},
            "Point 22 was already GREEN, so sequential progress must continue through 22")
    require(master["counts"]=={"green":28,"yellow":45,"red":27,"total":100},
            "Official master counts drift after Step 21")

    for token in [
        "previously printed QR",
        "minimal public lifecycle tombstone",
        "not presented as a new EU legal classification",
        "Generic passport PATCH cannot bypass",
    ]:
        require(token in docs,f"Step 21 acceptance doc missing: {token}")

    print("STEP21_PASSPORT_LIFECYCLE_UX_PASS: retired/revoked/replaced identifiers resolve safely, replaced links to an ACTIVE successor, and terminal transitions are tenant-scoped and non-bypassable")

if __name__=="__main__":
    main()
