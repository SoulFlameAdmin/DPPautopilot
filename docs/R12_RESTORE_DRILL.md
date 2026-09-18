# R12 — Isolated Restore Drill

## Drill design

The automated restore drill uses only synthetic CI data. It never copies production/customer data.

1. Start a clean PostgreSQL 17 service.
2. Replay every canonical DPP migration into the source database.
3. Insert a minimal synthetic organisation/model/item/passport record set.
4. Create a logical custom-format backup with `pg_dump`.
5. Create a second isolated database in the same CI PostgreSQL service.
6. Restore the dump with `pg_restore`.
7. Verify:
   - DPP tables exist.
   - Synthetic row counts match.
   - passport/item relationships survive.
   - RLS remains enabled on core DPP tables.
   - canonical binding row survives.

The drill proves the committed schema and logical backup path are restorable from a clean environment. It does not claim that the current Supabase Free plan provides automatic production backups; R11 explicitly records that limitation.

## Acceptance evidence

R12 becomes GREEN only when GitHub Actions prints `R12_RESTORE_DRILL_PASS` in a successful full CI run.
