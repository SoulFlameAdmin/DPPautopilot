# M12 — Critical Audit Log Progress

Status: **PARTIAL — master task remains RED**

This dependency-safe precursor adds database-level critical audit infrastructure over the existing DPP schema.

Implemented:

- append-only `dpp_audit_log`
- actor, action, timestamp, target table/id, before snapshot and after snapshot
- actor resolution from the request JWT subject when present, otherwise existing `created_by` metadata
- audit triggers for organisations, organisation membership, battery models/items, passports, import mappings/runs and registry submissions
- RLS enabled and direct `anon` / `authenticated` table privileges revoked
- UPDATE and DELETE of existing audit rows rejected by an immutable-history trigger
- audit rows intentionally do not foreign-key tenant/user records, so history is not automatically erased by future account deletion

Regression coverage verifies UPDATE before/after capture, DELETE capture, actor/target metadata, append-only mutation rejection and deny-by-default grants.

M12 remains RED until M03 RBAC is implemented and authenticated actor/authorization behavior is proven through the application/API layer.

## Evidence — immutable audit precursor

- Migration `20260919007000_dpp_audit_log.sql` is present and the bound Supabase project exposes `dpp_audit_log`, `dpp_capture_audit_event()` and `dpp_reject_audit_mutation()`.
- Bound Supabase rollback test returned `M12_AUDIT_LOG_SUBSET_PASS`, proving UPDATE before/after capture, DELETE capture, actor/target metadata, append-only mutation rejection and deny-by-default grants.
- GitHub Actions run `35399171822` includes `Run M12 audit log subset` PASS after clean PostgreSQL 17 replay.
- Full run `35399171822` is SUCCESS; UI artifact `10569812847`.
- M12 remains RED because M03 RBAC is still RED and authenticated actor/authorization behavior is not yet proven through the application/API layer.

