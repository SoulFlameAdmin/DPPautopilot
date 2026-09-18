#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260918231500_dpp_core_schema.sql"

EXPECTED_TABLES = [
    "dpp_organizations",
    "dpp_organization_members",
    "dpp_battery_models",
    "dpp_battery_items",
    "dpp_passports",
]

REQUIRED_SNIPPETS = [
    "references auth.users(id)",
    "dpp_battery_items_org_model_fk",
    "dpp_passports_org_item_fk",
    "unique_identifier text not null unique",
    "role in ('owner','admin','editor','viewer')",
    "lifecycle_status in ('original','repurposed','remanufactured','second_life','waste','retired')",
    "status in ('draft','active','suspended','retired')",
    "enable row level security",
    "revoke all on table public.dpp_organizations from anon, authenticated",
    "revoke all on table public.dpp_passports from anon, authenticated",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    for table in EXPECTED_TABLES:
        require(f"create table public.{table}" in sql, f"missing M04 table: {table}")
        require(f"alter table public.{table} enable row level security" in sql, f"RLS not enabled in migration for {table}")
        require(f"revoke all on table public.{table} from anon, authenticated" in sql, f"client revoke missing for {table}")

    for snippet in REQUIRED_SNIPPETS:
        require(snippet.lower() in sql, f"missing M04 schema contract: {snippet}")

    require(sql.count("primary key") >= 5, "M04 migration must define primary keys for core tables")
    require(sql.count("foreign key") >= 2 or sql.count("references ") >= 8, "M04 migration lacks expected FK coverage")
    require(sql.count("check (") >= 8, "M04 migration lacks expected check constraints")

    print("M04_SCHEMA_CONTRACT_PASS: 5 DPP core tables, PK/FK/check constraints, tenant-safe composite FKs, RLS and client revokes are present")


if __name__ == "__main__":
    main()
