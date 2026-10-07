# P0 Early Access hardening plan

This plan is intentionally isolated from the current production-fix branch. Do not merge until the current physical refresh blocker and CI M17/M18 regressions are green.

## Goal

Make the Google-only Early Access path safe under concurrent tabs, missing active-tenant context, and access-token expiry without changing the product flow.

## P0-1: Atomic organization ensure

### Current risk
`manufacturer-early.js` can call the generic organization-create RPC when no active tenant is discovered. The create RPC always inserts a new organization, so concurrent tabs or devices can create duplicate organizations for the same authenticated user.

### Required server contract
Add one authenticated RPC, conceptually:

`dpp_api_organization_ensure(p_name text, p_slug text)`

Within one transaction it must:

1. Resolve the authenticated user using the existing request-user helper.
2. Acquire a transaction-scoped advisory lock derived from that user id.
3. Re-read active tenant state after acquiring the lock.
4. If an active organization exists and membership is valid, return it unchanged.
5. If no active organization exists and the user has exactly one valid organization membership, call the existing active-organization setter and return that organization.
6. If the user has no memberships, create exactly one organization, create owner membership, activate it, and return it.
7. If the user has multiple memberships and no active organization, fail closed with an explicit application error instead of guessing.
8. Revoke EXECUTE from PUBLIC and anon; grant only to authenticated.
9. Use a pinned safe search_path for any SECURITY DEFINER implementation.

### Client change
Replace direct `dpp_api_organization_create` fallback in Early Access with the ensure RPC. The client must never generate a second random organization after a recoverable race.

### Acceptance
- Two concurrent first-login requests for one user produce one organization.
- Refresh after organization creation returns the same organization id.
- Existing single membership with missing active context is activated automatically.
- Multiple memberships with missing active context produce a deterministic fail-closed response.

## P0-2: Session refresh and one-shot retry

### Current risk
Early Access persists the Google refresh token but does not consistently refresh and retry a failed authenticated request during the 8/8 onboarding flow.

### Required client contract
Reuse the proven manufacturer-dashboard pattern:

1. Keep one in-flight refresh promise to prevent refresh storms.
2. On an authenticated request returning HTTP 401, call `/auth/v1/token?grant_type=refresh_token` with the stored refresh token.
3. Persist the returned access token, refresh token, and expiry back into `dpp_google_session_v1`.
4. Retry the original request exactly once.
5. If refresh fails, clear unusable session state and return to Google login with a visible, non-secret error.
6. Never retry 403, 409, 422, or arbitrary 5xx as an auth refresh.

### Acceptance
- Token expiry between onboarding questions does not lose completed answers.
- A 401 triggers one refresh and one retry only.
- Parallel requests share one refresh operation.
- Invalid/expired refresh token fails closed and returns to login.

## P0-3: Physical E2E gate

Run from a clean browser profile and again from an existing returning session:

1. Google sign-in.
2. Complete 8/8 onboarding.
3. Enter Manufacturer Dashboard.
4. Create/open product SKU.
5. Refresh `/manufacturer`.
6. Close and reopen browser.
7. Open a second tab during first-run tenant bootstrap.
8. Verify both tabs resolve to the same organization id.
9. Force an expired access token while retaining a valid refresh token and continue the flow.
10. Confirm no Company Access fallback, no duplicate org, no uncaught console error, and no answer loss.

## Release rule

Do not mark the pilot fully ready from CI alone. Required evidence is:

- main CI green;
- Cross-browser green;
- U07 visual green;
- physical Google login PASS;
- physical refresh/reopen PASS;
- concurrent-tab tenant idempotency PASS;
- token-expiry refresh PASS;
- one real customer UAT remains a separate business-validation gate.
