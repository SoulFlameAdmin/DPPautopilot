#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sql=(ROOT/"supabase/migrations/20260919000000_dpp_transactional_imports.sql").read_text(encoding="utf-8").lower()

def require(c,m):
    if not c:
        raise AssertionError(m)

for snippet in [
    "create table public.dpp_import_runs",
    "create table public.dpp_import_rows",
    "status text not null default 'staged' check (status in ('staged','validated','invalid','committed'))",
    "validation_errors jsonb not null default '[]'::jsonb",
    "dpp_validate_import",
    "dpp_commit_import",
    "for update",
    "jsonb_array_length(v_row.validation_errors)",
    "on conflict (organization_id,model_identifier) do update",
    "returning id into v_item_id",
    "status='committed'",
    "revoke all on function public.dpp_validate_import(uuid) from public,anon,authenticated",
    "revoke all on function public.dpp_commit_import(uuid) from public,anon,authenticated",
]:
    require(snippet in sql,f"M20 transactional import contract missing: {snippet}")

require("enable row level security" in sql,"M20 import staging tables must enable RLS")
require("revoke all on table public.dpp_import_runs from anon,authenticated" in sql,"M20 import runs must be deny-by-default")
require("revoke all on table public.dpp_import_rows from anon,authenticated" in sql,"M20 import rows must be deny-by-default")

print("M20_TRANSACTIONAL_IMPORT_CONTRACT_PASS: staged rows, validation state, atomic commit function, tenant scope, RLS and deny-by-default access are present")
