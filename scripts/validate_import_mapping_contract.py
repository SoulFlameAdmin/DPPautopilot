#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sql=(ROOT/"supabase/migrations/20260918235000_dpp_import_mappings.sql").read_text(encoding="utf-8").lower()

def require(c,m):
    if not c: raise AssertionError(m)

for snippet in [
 "create table public.dpp_import_mappings",
 "source_headers jsonb not null",
 "field_mapping jsonb not null",
 "unique (organization_id,name)",
 "dpp_touch_import_mapping_revision",
 "new.revision := old.revision + 1",
 "enable row level security",
 "revoke all on table public.dpp_import_mappings from anon,authenticated"
]:
    require(snippet in sql,f"M07 persistence contract missing: {snippet}")
print("M07_MAPPING_DB_CONTRACT_PASS: tenant-scoped saved mapping schema, revision tracking, RLS and deny-by-default grants are present")
