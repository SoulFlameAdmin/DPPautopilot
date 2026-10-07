#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/"data/rate-limit-policy.json").read_text(encoding="utf-8"))

assert policy.get("version")==11
assert policy.get("task")=="R05"
assert policy.get("status")=="partial"
assert policy.get("strategy")=="dual_layer_local_plus_feature_gated_shared_authenticated_runtime"
identity=policy.get("identity_safety",{})
assert identity=={
    "network_bucket_always_enforced":True,
    "credential_bucket_when_authorization_present":True,
    "allow_only_when_all_buckets_within_limit":True,
    "bearer_rotation_cannot_reset_network_budget":True,
    "active_request_buckets_protected_from_cap_eviction":True,
}
memory=policy.get("memory_safety",{})
assert memory=={
    "max_buckets":10000,
    "prune_interval_ms":10000,
    "expired_bucket_eviction":True,
    "active_bucket_cap":True,
}

rules=policy.get("rules",{})
expected_rules={
    "public_passport_read":(30,60),
    "authenticated_read":(120,60),
    "authenticated_write":(40,60),
    "export_read":(20,60),
    "import_write":(20,60),
}
assert set(rules)==set(expected_rules)
for name,(limit,window) in expected_rules.items():
    assert rules[name]["limit"]==limit
    assert rules[name]["window_seconds"]==window

surfaces=policy.get("surfaces",{})
expected_surface_rules={
    "application":{"GET":"authenticated_read","POST":"authenticated_write"},
    "manufacturer-onboarding":{"GET":"authenticated_read","POST":"authenticated_write"},
    # Registration request creation is anonymous but intentionally consumes the
    # stricter write budget locally. Authenticated GET/PATCH use the same write
    # budget in both local and shared layers.
    "registration-link":{"GET":"authenticated_write","POST":"authenticated_write","PATCH":"authenticated_write"},
    "tenant":{"GET":"authenticated_read","POST":"authenticated_write"},
    "organizations":{"GET":"authenticated_read","POST":"authenticated_write"},
    "members":{"GET":"authenticated_read","POST":"authenticated_write","PATCH":"authenticated_write","DELETE":"authenticated_write"},
    "models":{"GET":"authenticated_read","POST":"authenticated_write","PATCH":"authenticated_write","DELETE":"authenticated_write"},
    "items":{"GET":"authenticated_read","POST":"authenticated_write","PATCH":"authenticated_write","DELETE":"authenticated_write"},
    "passport":{"public_GET":"public_passport_read","private_GET":"authenticated_read","POST":"authenticated_write","PATCH":"authenticated_write"},
    "provision":{"POST":"authenticated_write"},
    "batch-provision":{"POST":"authenticated_write"},
    "carriers":{"GET":"authenticated_read","POST":"authenticated_write","PATCH":"authenticated_write"},
    "imports":{"GET":"authenticated_read","POST":"import_write","PATCH":"import_write"},
    "export":{"GET":"export_read"},
    "qr":{"GET":"public_passport_read"},
}
assert surfaces==expected_surface_rules, "R05 surface/method policy drift"
api_surface_inventory={
    path.stem for path in (ROOT/"api").glob("*.js")
    if not path.name.startswith("_")
}
assert set(surfaces)==api_surface_inventory, f"R05 uncovered public API surface(s): {sorted(api_surface_inventory-set(surfaces))}"

response=policy.get("response",{})
assert response.get("http_status")==429
assert response.get("code")=="RATE_LIMITED"
assert "Retry-After" in response.get("headers",[])
assert "X-RateLimit-Limit" in response.get("headers",[])
assert "X-RateLimit-Remaining" in response.get("headers",[])
assert "X-RateLimit-Reset" in response.get("headers",[])

helper=(ROOT/"api/_rate_limit.js").read_text(encoding="utf-8")
for token in [
    "createHash('sha256')",
    "checkRateLimit",
    "networkDigest",
    "bucketIdentities",
    "Retry-After",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "pruneBuckets",
    "DEFAULT_MAX_BUCKETS",
]:
    assert token in helper, f"R05 helper missing {token}"

# Every public API surface must consume the process-local network budget before
# business RPCs. Most use classifier defaults; registration-link deliberately
# applies the stricter write budget to all three methods because POST is public.
for surface in sorted(set(surfaces)-{"registration-link"}):
    text=(ROOT/f"api/{surface}.js").read_text(encoding="utf-8")
    assert "require('./_rate_limit.js')" in text, f"{surface} does not import R05 limiter"
    call=f"enforceRateLimit(req,res,'{surface}')"
    assert call in text, f"{surface} does not enforce R05 limiter"
    assert text.index(call) < text.index("await rpc(") if "await rpc(" in text else True

registration=(ROOT/"api/registration-link.js").read_text(encoding="utf-8")
registration_local="enforceRateLimit(req,res,'registration-link',{ruleName:'authenticated_write'})"
assert "require('./_rate_limit.js')" in registration
assert registration_local in registration, "registration-link does not enforce the strict local write budget"
assert registration.index(registration_local) < registration.index("await rpc(")

contract=json.loads((ROOT/"data/api-error-contract.json").read_text(encoding="utf-8"))
assert contract["local_codes"]["RATE_LIMITED"]=={
    "http_status":429,
    "message":"Too many requests. Retry later."
}

test_path=ROOT/"tests/api/rate-limit.test.cjs"
assert test_path.is_file()
test_text=test_path.read_text(encoding="utf-8")
for token in [
    "R05_RATE_LIMIT_PRECURSOR_PASS",
    "41st authenticated model write",
    "31st anonymous public passport read",
    "41st authenticated tenant context write",
    "41st authenticated member write",
    "41st authenticated organization write",
    "RATE_LIMITED",
    "retry-after",
    "expired dual buckets are evicted",
    "bucket map is hard capped",
    "bucket keys do not retain raw IP",
    "rotating bearer or network identity cannot bypass the paired budgets",
    "active network bucket survives memory-cap credential churn",
]:
    assert token in test_text, f"R05 abuse suite missing {token}"

shared=policy.get("shared_backend",{})
assert shared.get("status")=="runtime_wired_feature_gated"
assert shared.get("table")=="dpp_rate_limit_buckets"
assert shared.get("rpc")=="dpp_rate_limit_consume(text,integer,integer,timestamptz)"
assert shared.get("scope")=="authenticated network/credential budgets only"
assert shared.get("atomic_increment") is True
assert shared.get("fixed_window_reset") is True
assert shared.get("direct_table_grants") is False
assert shared.get("anon_rpc_execute") is False
assert shared.get("authenticated_rpc_execute") is True
assert "10 minutes" in shared.get("stale_row_retention","")
assert shared.get("runtime_gate")=="DPP_SHARED_RATE_LIMIT_ENABLED=true"
assert shared.get("failure_mode")=="fail_closed_503"
assert "public passport" in shared.get("public_anonymous_scope","")
assert "registration-link POST" in shared.get("public_anonymous_scope","")

migration=(ROOT/"supabase/migrations/20260920152000_dpp_shared_rate_limit_backend.sql").read_text(encoding="utf-8")
for token in [
    "create table if not exists public.dpp_rate_limit_buckets",
    "create or replace function public.dpp_rate_limit_consume",
    "security definer",
    "set search_path = public, pg_temp",
    "revoke all on table public.dpp_rate_limit_buckets from public, anon, authenticated",
    "grant execute on function public.dpp_rate_limit_consume",
    "p_bucket_key !~",
    "request_count + 1",
    "reset_at < p_now - interval '10 minutes'",
]:
    assert token.lower() in migration.lower(), f"R05 shared backend migration missing {token}"

db_test=(ROOT/"tests/db/test_shared_rate_limit_backend.sql").read_text(encoding="utf-8")
for token in [
    "R05_SHARED_RATE_LIMIT_BACKEND_PASS",
    "shared over-budget mismatch",
    "shared window reset mismatch",
    "invalid shared bucket key was accepted",
    "unauthenticated shared consume was accepted",
    "shared bucket table regained direct client privileges",
]:
    assert token in db_test, f"R05 shared backend regression missing {token}"

for token in [
    "sharedBucketKeys",
    "sharedLimiterEnabled",
    "checkSharedRateLimit",
    "enforceSharedRateLimit",
    "RATE_LIMIT_BACKEND_UNAVAILABLE",
    "DPP_SHARED_RATE_LIMIT_ENABLED",
]:
    assert token in helper, f"R05 shared runtime helper missing {token}"
assert "shared backend keys match the DB-safe pseudonymous contract" in test_text
assert "feature-gated shared limiter consumes both pseudonymous buckets" in test_text
assert "shared limiter fails closed when its backend is unavailable" in test_text
assert "all authenticated API surfaces honor shared limiter 429 before business RPC" in test_text

# Every fully-authenticated API surface must wire the shared limiter. Public QR
# and anonymous registration-link POST remain local-only by design; the same
# registration handler must still apply shared protection after bearer auth for
# GET/PATCH.
shared_surfaces=[
    "application","manufacturer-onboarding","tenant","organizations","members",
    "models","items","passport","provision","batch-provision","imports","export","carriers"
]
for surface in shared_surfaces:
    surface_text=(ROOT/f"api/{surface}.js").read_text(encoding="utf-8")
    assert "enforceSharedRateLimit" in surface_text, f"{surface} does not import shared R05 limiter"
    assert f"enforceSharedRateLimit(req,res,'{surface}'" in surface_text, f"{surface} does not wire shared R05 limiter"

registration_shared="enforceSharedRateLimit(req,res,'registration-link',authorization,{ruleName:'authenticated_write'})"
assert "enforceSharedRateLimit" in registration, "registration-link does not import shared R05 limiter"
assert registration_shared in registration, "registration-link authenticated methods do not wire shared R05 limiter"
assert registration.index("if(method==='POST')") < registration.index("const authorization=bearer(req)")
assert registration.index("const authorization=bearer(req)") < registration.index(registration_shared)

limitations=policy.get("limitations",[])
assert any("production enablement" in x for x in limitations)
assert any("Anonymous public passport" in x for x in limitations)
assert any("anonymous registration-link" in x for x in limitations)
assert any("multi-isolate" in x for x in limitations)

print("R05_RATE_LIMIT_POLICY_PASS: fifteen API surfaces keep local abuse budgets; all authenticated surfaces wire the atomic shared Supabase backend behind an explicit fail-closed feature gate; anonymous public passport and registration creation remain local-only pending safe distributed identity acceptance")
