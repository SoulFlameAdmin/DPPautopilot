# DPP Master Plan 29–35 · Production Acceptance

Accepted on 2026-10-05 against the production DPP stack.

## 29 · Passports tab production
- Tenant-scoped `dpp_api_passports_list` RPC.
- Authenticated `GET /api/passport?list=1`.
- Manufacturer operations UI lists passport ID, battery identifier, status, updated time and links to completeness/public/QR views.

## 30 · QR / Print Center production
- Bulk selection of ACTIVE passports.
- Before printing, each selected item is checked for an ACTIVE QR physical carrier and bound if needed.
- Print sheet renders one server-generated QR per physical battery.
- Live smoke confirmed QR target: `/passport?identifier=...&carrier=qr`.

## 31 · Secure physical carrier binding
- `dpp_api_carrier_bind_secure` derives the canonical public URL inside the database from the tenant-scoped battery identifier.
- Authenticated callers cannot provide an arbitrary carrier URL.
- Legacy direct `dpp_api_carrier_bind(..., p_public_url, ...)` was revoked from `authenticated` and remains internal/service-only.
- QR and NFC are supported; NFC technology and optional external UID are validated.

## 32 · Carrier revoke / reissue / reprint
- Operator UI exposes reissue and revoke for ACTIVE carriers.
- QR reprint is non-mutating.
- Reissue replaces the prior ACTIVE carrier through the existing lifecycle invariant.
- Production DB acceptance verified bind → revoke → reissue.

## 33 · Scan history
- Bound QR/NFC public opens call `dpp_api_carrier_open`.
- Scan events persist source/result/timestamp and are read through tenant-scoped `dpp_api_carrier_scan_history`.
- Manufacturer UI shows scan history.
- Legacy/unbound QR links safely fall back to the public passport without fabricating a scan event.
- Production DB acceptance verified one QR open creates one attributed history event.

## 34 · CSV upload / mapping UI
- Production manufacturer UI accepts CSV files up to 1000 rows.
- Column mapping targets canonical DPP model/item fields.
- Preview and local required-field/category/lifecycle checks run before staging.
- Valid normalized rows are sent through the authenticated `/api/imports` flow; this is no longer the synthetic demo page.

## 35 · CSV transaction / idempotency acceptance
- Existing transactional import core remains the write path.
- Production UI runs Stage → Validate → Commit and then immediately replays Commit.
- PASS requires first commit `already_committed=false`, second commit `already_committed=true`, and identical committed row counts.
- A rollback-isolated acceptance test was executed against the production database and passed with exactly one battery item and one committed row link.

## Verification
- Vercel production deployment: READY.
- Live manufacturer page includes the 29–35 operations center.
- Changed browser/server JavaScript parses successfully.
- Live QR endpoint returns SVG with `X-DPP-Carrier: qr` and scan-aware target URL.
- Relevant carrier foreign-key lookup received a covering index.
- Supabase ACL check confirms direct arbitrary-URL carrier binding is no longer executable by `authenticated`.
