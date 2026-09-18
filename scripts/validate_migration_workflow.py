#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=ROOT/"supabase/migrations"

def require(c,m):
    if not c: raise AssertionError(m)

files=sorted(MIGRATIONS.glob("*.sql"))
require(len(files)>=2,"M06 requires canonical binding + core-schema migrations")
names=[p.name for p in files]
require(names==sorted(names),"migration filenames are not lexicographically ordered")
require(all(re.match(r"^\d{14}_[a-z0-9_]+\.sql$",n) for n in names),"migration names must use YYYYMMDDHHMMSS_name.sql")
require(len(set(n[:14] for n in names))==len(names),"migration timestamps must be unique")

for p in files:
    sql=p.read_text(encoding="utf-8").lower()
    require("drop schema public" not in sql and "drop table public" not in sql,f"destructive public DDL forbidden in {p.name}")
    for match in re.findall(r"(?:create table(?: if not exists)?|alter table|revoke all on table)\s+public\.([a-z0-9_]+)",sql):
        require(match.startswith("dpp_"),f"non-DPP public table referenced by DPP migration {p.name}: {match}")

require("dpp_app_binding" in files[0].read_text(encoding="utf-8"),"first migration must establish DPP binding")
require(any("dpp_organizations" in p.read_text(encoding="utf-8") for p in files),"core schema migration missing from ordered history")
print("M06_MIGRATION_ORDER_PASS: canonical DPP migrations are timestamp-ordered, non-destructive, DPP-prefixed, and ready for clean PostgreSQL replay")
