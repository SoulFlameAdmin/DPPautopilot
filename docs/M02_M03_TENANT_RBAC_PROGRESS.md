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
