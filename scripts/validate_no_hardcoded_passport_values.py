#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "api" / "passport.js"
CREATE_SQL = ROOT / "supabase" / "migrations" / "20260920042000_dpp_passport_create_idempotency.sql"
BASE_SQL = ROOT / "supabase" / "migrations" / "20260919022000_dpp_passports_api.sql"
UPDATE_SQL = ROOT / "supabase" / "migrations" / "20260919036000_dpp_optimistic_concurrency.sql"

FORBIDDEN_PRODUCT_LITERALS = (
    "data/sample-battery.json",
    "urn:dpp:demo:",
    "Safe Maker",
    "Example Battery Co.",
    "NSD-EV-82-DEMO",
    "DEMO-TEST-REPORT-001",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def validate() -> None:
    api = load(API)
    create_sql = load(CREATE_SQL)
    base_sql = load(BASE_SQL)
    update_sql = load(UPDATE_SQL)
    production = "\n".join((api, create_sql, base_sql, update_sql))

    for literal in FORBIDDEN_PRODUCT_LITERALS:
        require(literal not in production, f"BAT07 hardcoded product/demo literal found: {literal}")

    # HTTP writes must forward caller-provided payloads rather than synthesize battery values.
    require(
        "p_public_payload: body.public_payload || {}" in api,
        "BAT07 POST must forward body.public_payload",
    )
    require(
        "p_private_payload: body.private_payload || {}" in api,
        "BAT07 POST must forward body.private_payload",
    )
    require(
        "p_public_payload: body.public_payload == null ? null : body.public_payload" in api,
        "BAT07 PATCH must forward body.public_payload",
    )
    require(
        "p_private_payload: body.private_payload == null ? null : body.private_payload" in api,
        "BAT07 PATCH must forward body.private_payload",
    )

    # The database create path must persist the supplied payloads without replacing them.
    require(
        "v_org,p_battery_item_id,'draft',p_public_payload,p_private_payload,v_user" in create_sql,
        "BAT07 DB create path must persist supplied public/private payloads",
    )
    require(
        "'public_payload',v_passport.public_payload" in create_sql
        and "'private_payload',v_passport.private_payload" in create_sql,
        "BAT07 DB create response must come from persisted passport row",
    )

    # Public read values must come from persisted item/passport rows.
    require(
        "'unique_identifier',i.unique_identifier" in base_sql,
        "BAT07 public identifier must come from stored battery item",
    )
    require(
        "'public_payload',p.public_payload" in base_sql,
        "BAT07 public passport payload must come from stored passport row",
    )

    # Checked updates must pass through supplied payload values to the authoritative update RPC.
    require(
        "p_id,p_status,p_public_payload,p_private_payload" in update_sql,
        "BAT07 checked update must pass caller payloads through to DB update",
    )

    print("BAT07_NO_HARDCODED_PASSPORT_VALUES_PASS: production passport create/read/update paths are data-driven")


if __name__ == "__main__":
    validate()
