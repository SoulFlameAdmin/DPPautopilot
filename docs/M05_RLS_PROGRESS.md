# M05 — RLS Policy Progress

Status: **PARTIAL — master task remains RED**

A tenant/RBAC policy precursor is now defined for the existing DPP schema while production table grants remain revoked.

Policy model:

- any tenant member (owner/admin/editor/viewer) may read tenant operational data
- owner/admin/editor may insert/update operational data
- owner/admin may delete operational data
- only owner/admin may read audit log rows
- passport version history is read-only through RLS
- cross-tenant access resolves through membership + request JWT subject
- malformed/missing JWT subject resolves to no membership rather than bypass

The negative security suite uses temporary table grants and synthetic auth users inside a transaction that is rolled back. It verifies owner tenant visibility, cross-tenant read/write denial, viewer read-only behavior and isolation from another tenant owner.

Production `anon`/`authenticated` table grants remain revoked. M05 remains RED until M02 and M03 are GREEN and the same policies are exercised through the real authenticated application/API path.

## Evidence — 2026-09-19

- Bound Supabase migration `dpp_tenant_rls_policies`: applied successfully.
- Runtime transaction/rollback test returned `M05_RLS_POLICY_SUBSET_PASS`.
- Cross-tenant owner reads/writes were denied; viewer writes were denied; own-tenant reads remained available under temporary transactional grants.
- Synthetic auth identities were rolled back; post-test count for those IDs was zero.
- Direct production table grants to `anon`/`authenticated` were not opened by the migration.
- Initial CI attempt exposed a harness-only issue: `SET LOCAL ROLE` was run without a surrounding transaction, so PostgreSQL reverted to `postgres`. CI was corrected to run the RLS subset inside `BEGIN/ROLLBACK` rather than weakening policies.
- Full GitHub Actions run `35399659669` on `c2514191a5558a06b8332b61c81c54b293d9d093`: SUCCESS, including M05 RLS subset and browser smoke. Artifact `10569033696`.
- M05 remains RED until M02/M03 are implemented and the policies are proven through the real authenticated application/API path.

