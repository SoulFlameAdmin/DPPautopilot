# Step 21 — Revoked / Replaced / Retired Passport UX

Status: GREEN when static, API and PostgreSQL acceptance checks pass.

## User outcome

A QR or identifier does not become a misleading "not found" page merely because the passport is no longer current.

The public resolver now has two modes:

- **ACTIVE** — returns the existing public payload and the normal Step 20 passport.
- **Terminal / unavailable** — returns a fail-closed public tombstone with no historical public payload.

Explicit terminal states are:

- **REVOKED** — the passport is suspended and publicly marked revoked.
- **REPLACED** — the old passport is retired and may point to one different ACTIVE passport in the same tenant.
- **RETIRED** — the passport is retired and remains publicly resolvable as an archived lifecycle record.

A plain suspended passport that has not been explicitly revoked resolves as **UNAVAILABLE**, not as revoked.

## Security boundary

Terminal public records contain only passport identity, public lifecycle state, optional replacement identifier, and update timestamp. The HTTP sanitizer forces `public_payload={}` for every non-ACTIVE state even if the database projection regresses.

The replacement transition is authenticated and tenant-scoped. The replacement identifier must belong to a different ACTIVE passport in the same organization.

The anonymous role can execute only the public resolver. It cannot execute the terminal transition function.

## Deliberate non-goals

Step 21 does not close the full Passports management tab (#29), carrier reissue (#32), authority access (#50), or final bilingual public passport (#76).
