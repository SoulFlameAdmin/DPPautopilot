# ENGINE STAGE 1 — P0 Tenant Canonicalization

Status: IN PROGRESS — NOT DEPLOYED.

Source: `SoulFlameAdmin/soulflame-twins` branch `mitko/dpp-onboarding-persistence-fix`, deployed revision `037efcd5f5c7e30c9ad01cfa353d9608bc10ad0c`.

Target: replace service-role direct organization/member creation and arbitrary first-membership fallback with an authenticated caller JWT to `public.dpp_api_organization_ensure(text,text)`.

## Acceptance

- Missing company name: do not create organization.
- Missing/expired caller bearer JWT: 401; do not send service-role bearer in place of user identity.
- One existing membership: deterministic recovery; do not duplicate.
- Two or more memberships without explicit active choice: DP103 / HTTP 409; never choose first arbitrarily.
- Concurrent two-tab new company registration creates exactly one organization and one membership.
- All 8 onboarding answers persist across refresh and account reopen.
- Product, batch, DPP, QR, and ready states remain PENDING until actual record-level verification (8/8 configuration alone is not production completion).
- No mutation of unrelated non-DPP schemas.
- CI/main security gate and negative cross-company tests pass after migration.

## Release sequence

1. Verify backup/restore and owner-approved infrastructure.
2. Verify live migration list and apply reviewed `dpp_organization_ensure` to the bound Supabase project only; verify exact version/name.
3. Stage Twins backend changes on a new branch, require independent Borko review.
4. Replay migration + E2E on isolated staging; then controlled deploy.
5. Verify production endpoint HTTP 200 (not merely Vercel READY metadata); execute 2-company physical E2E.

See `docs/STABILITY_ENGINE_P0_EXECUTION_LOG_2026-10-08.md` for the full P0 preflight.
