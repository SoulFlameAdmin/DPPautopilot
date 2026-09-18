# M17 — Models API Progress

Status: **PARTIAL — master task remains RED**

Implemented and evidence-backed precursor:

- Vercel serverless route `/api/models` supports GET/POST/PATCH/DELETE.
- The route requires a caller Bearer token and forwards that token to Supabase; it does not use a service-role bypass.
- Four narrow SECURITY DEFINER RPCs implement model list/create/update/delete.
- Tenant scope comes only from the explicit active organisation; the client cannot supply an organisation id.
- Server-side role rules: viewer may list; editor/admin/owner may create/update; admin/owner may delete.
- Validation covers identifiers, manufacturer, battery category, canonical JSON and model ids.
- Cross-tenant update/delete return the same not-found contract as missing records.
- Vercel SPA rewrites explicitly exclude `/api/*`.
- The authenticated RPC surface is pinned in the global SECURITY DEFINER allowlist.

Evidence:

- GitHub Actions run `35403166134` on commit `206e8cc445053ff413c5598962988bb6589a5188` completed SUCCESS.
- The run passed Node HTTP contract tests, clean PostgreSQL 17 replay, `M17_MODELS_RPC_SUBSET_PASS`, global DPP RLS grants guard, DPP SECURITY DEFINER RPC guard and browser regression.
- Migration `dpp_models_api` was applied successfully to bound Supabase project `frhletkiuupgksmgxoxc`.
- A bound Supabase rollback transaction returned `M17_MODELS_RPC_SUBSET_PASS`.
- Live ACL verification showed all four model RPCs use SECURITY DEFINER with `search_path=public, pg_temp`, deny `anon` EXECUTE and allow `authenticated` EXECUTE.

M17 remains RED because its declared dependency M03 is not GREEN, M01 authentication acceptance is externally blocked, and deployed end-to-end authenticated CRUD cannot be proven while the production deployment path is blocked.
