#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
m11=(ROOT/"supabase/migrations/20260918232500_dpp_passport_version_history.sql").read_text(encoding="utf-8").lower()
m14=(ROOT/"supabase/migrations/20260918233000_dpp_identifier_lifecycle_rules.sql").read_text(encoding="utf-8").lower()

def require(c,m):
    if not c: raise AssertionError(m)

for snippet in [
    "create table public.dpp_passport_versions",
    "unique (passport_id, version_no)",
    "after insert or update of status, public_payload, private_payload",
    "dpp_passport_versions is append-only",
    "enable row level security",
    "revoke all on table public.dpp_passport_versions from anon, authenticated",
]:
    require(snippet in m11,f"M11 contract missing: {snippet}")

for snippet in [
    "dpp_lifecycle_transition_allowed",
    "dpp_enforce_lifecycle_transition",
    "before update of lifecycle_status on public.dpp_battery_items",
    "old_status = 'second_life' and new_status in ('waste','retired')",
    "invalid dpp lifecycle transition",
]:
    require(snippet in m14,f"M14 contract missing: {snippet}")

core=(ROOT/"supabase/migrations/20260918231500_dpp_core_schema.sql").read_text(encoding="utf-8").lower()
require("unique_identifier text not null unique" in core,"M14 requires globally unique battery identifier in M04")
print("M11_M14_CONTRACT_PASS: immutable passport versions and lifecycle/identifier enforcement are present in ordered DPP migrations")
