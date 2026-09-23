# M02 / M03 — Tenant Context and RBAC Progress

Status: **PARTIAL — both master tasks remain RED**

This precursor turns the existing organisation-membership model into an explicit tenant context and reusable server-side authorization contract.

Implemented:

- one explicit active organisation per authenticated user
- database FK guarantees the selected active organisation is one of that user's memberships
- `dpp_set_active_organization(uuid)` rejects non-member tenant selection
- `dpp_active_organization_id()` provides the current explicit tenant context
- `dpp_require_active_role(text[])` enforces owner/admin/editor/viewer roles server-side
- stable fail-closed SQLSTATEs for missing auth, non-member tenant, missing active tenant and insufficient role
- direct table grants remain revoked; clients use narrow security-definer functions

Integration coverage exercises owner/admin/editor/viewer behavior, cross-tenant selection denial, insufficient-role denial and missing-auth denial.

M02 and M03 remain RED until M01 authentication is fully accepted and the application/API consumes this tenant/RBAC contract end-to-end.

## Evidence — 2026-09-19

- Bound Supabase project `frhletkiuupgksmgxoxc`: explicit rollback integration matrix returned `M02_M03_TENANT_RBAC_SUBSET_PASS`.
- Owner/admin/editor/viewer role behavior, non-member active-tenant denial, insufficient-role denial and missing-auth denial all passed.
- GitHub Actions run `35400537746` on `f6d7a964d6f2482f1701c86d36f54262455dbdb7`: SUCCESS.
- Clean PostgreSQL replay step `Run M02 M03 tenant RBAC subset`: PASS.
- Browser smoke: PASS; artifact `10569034799`.
- M02/M03 remain RED because M01 runtime recovery completion is still externally blocked and app/API consumption has not yet been accepted.

## Live production / bound-DB readback — 2026-09-23

- Canonical production endpoints `/api/tenant`, `/api/organizations` and `/api/members` each returned HTTP 401 `AUTH_REQUIRED` without a bearer token, with `Cache-Control: no-store`, a correlation `X-Request-ID` and the strict production CSP.
- Bound Supabase readback confirms `dpp_organizations`, `dpp_organization_members` and `dpp_user_tenant_context` exist with RLS enabled.
- The active-tenant row is database-bound to real membership by `FOREIGN KEY (user_id, active_organization_id) REFERENCES dpp_organization_members(user_id, organization_id) ON DELETE CASCADE`.
- Authenticated callers have EXECUTE on the narrow tenant/organization RPCs while anon does not; authenticated direct SELECT on the organization/member/context tables remains revoked.
- `dpp_api_authorization_context`, membership-management RPCs, `dpp_has_org_role` and `dpp_require_active_role` are SECURITY DEFINER with fixed `search_path=public, pg_temp`.
- The membership role CHECK remains exactly `owner | admin | editor | viewer`.
- These checks add fresh deployed/runtime evidence but do not promote M02/M03: M01 recovery completion is still not GREEN, so dependency order remains enforced.

