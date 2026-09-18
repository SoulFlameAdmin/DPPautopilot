#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sql=(ROOT/"supabase/migrations/20260918234000_dpp_registry_workflow.sql").read_text(encoding="utf-8").lower()

def require(c,m):
    if not c: raise AssertionError(m)

for snippet in [
    "create table public.dpp_registry_submissions",
    "environment in ('test','live')",
    "status in ('draft','queued','submitted','accepted','rejected','retry_wait','failed','cancelled')",
    "dpp_registry_org_item_fk",
    "dpp_registry_org_passport_fk",
    "dpp_registry_status_transition_allowed",
    "dpp_enforce_registry_status_transition",
    "attempt_count := old.attempt_count + 1",
    "new.submitted_at := now()",
    "new.accepted_at := now()",
    "new.rejected_at := now()",
    "enable row level security",
    "revoke all on table public.dpp_registry_submissions from anon, authenticated",
]:
    require(snippet in sql,f"M15/M16 contract missing: {snippet}")

require("does not claim live connectivity" in sql,"M15 must explicitly avoid unsupported live-registry claims")
print("M15_M16_CONTRACT_PASS: registry workflow abstraction, status graph, timestamps, retries, tenant-safe FKs and deny-by-default access are present")
