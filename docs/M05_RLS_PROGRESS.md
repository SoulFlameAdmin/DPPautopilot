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
