-- SOULFLAME DPP STAGE 1 / RESTORE CONSISTENCY REPORT
-- READ-ONLY: intended for a SEPARATE RESTORED PostgreSQL database.
-- WARNING: Passing this query on a production connection cannot PROVE a restore.
-- Compare against a manifest captured at the SAME backup timestamp. No PII printed.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
  'contract', 'dpp-restored-consistency-v1',
  'checked_at_utc', (now() AT TIME ZONE 'UTC')::text,
  'db_version', current_setting('server_version'),
  'schema_fingerprint', (
    SELECT md5(string_agg(
      format('%s.%s:%s:%s',table_name,column_name,udt_name,is_nullable),
      '|' ORDER BY table_name, ordinal_position
    ))
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name LIKE 'dpp_%'
  ),
  'dpp_tables', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'dpp_%'
  ),
  'rls_disabled_dpp_tables', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname LIKE 'dpp_%' AND NOT c.relrowsecurity
  ),
  'organizations', (SELECT count(*) FROM public.dpp_organizations),
  'organization_members', (SELECT count(*) FROM public.dpp_organization_members),
  'models', (SELECT count(*) FROM public.dpp_battery_models),
  'provision_batches', (SELECT count(*) FROM public.dpp_provision_batches),
  'battery_items', (SELECT count(*) FROM public.dpp_battery_items),
  'passports', (SELECT count(*) FROM public.dpp_passports),
  'passport_versions', (SELECT count(*) FROM public.dpp_passport_versions),
  'audit_events', (SELECT count(*) FROM public.dpp_audit_log),
  'early_access_sessions', (SELECT count(*) FROM public.dpp_early_access_sessions),
  'manufacturer_onboarding_answers', (SELECT count(*) FROM public.dpp_manufacturer_onboarding_answers),
  'manufacturer_configurations', (SELECT count(*) FROM public.dpp_manufacturer_configurations),
  'orphan_items_without_model', (
    SELECT count(*) FROM public.dpp_battery_items i
    LEFT JOIN public.dpp_battery_models m ON m.id=i.model_id WHERE m.id IS NULL
  ),
  'orphan_passports_without_item', (
    SELECT count(*) FROM public.dpp_passports p
    LEFT JOIN public.dpp_battery_items i ON i.id=p.battery_item_id WHERE i.id IS NULL
  ),
  'orphan_memberships', (
    SELECT count(*) FROM public.dpp_organization_members m
    LEFT JOIN public.dpp_organizations o ON o.id=m.organization_id WHERE o.id IS NULL
  ),
  'stale_active_tenants', (
    SELECT count(*) FROM public.dpp_user_tenant_context c
    LEFT JOIN public.dpp_organization_members m
      ON m.user_id=c.user_id AND m.organization_id=c.active_organization_id
    WHERE c.active_organization_id IS NOT NULL AND m.user_id IS NULL
  ),
  'item_model_cross_tenant', (
    SELECT count(*) FROM public.dpp_battery_items i
    JOIN public.dpp_battery_models m ON m.id=i.model_id
    WHERE i.organization_id IS DISTINCT FROM m.organization_id
  ),
  'passport_item_cross_tenant', (
    SELECT count(*) FROM public.dpp_passports p
    JOIN public.dpp_battery_items i ON i.id=p.battery_item_id
    WHERE p.organization_id IS DISTINCT FROM i.organization_id
  ),
  'passport_version_cross_tenant', (
    SELECT count(*) FROM public.dpp_passport_versions v
    JOIN public.dpp_passports p ON p.id=v.passport_id
    WHERE v.organization_id IS DISTINCT FROM p.organization_id
  ),
  'batch_model_cross_tenant', (
    SELECT count(*) FROM public.dpp_provision_batches b
    JOIN public.dpp_battery_models m ON m.id=b.model_id
    WHERE b.organization_id IS DISTINCT FROM m.organization_id
  ),
  'provision_item_cross_tenant', (
    SELECT count(*) FROM public.dpp_provision_batch_items bi
    JOIN public.dpp_provision_batches b ON b.id=bi.batch_id
    JOIN public.dpp_battery_items i ON i.id=bi.item_id
    WHERE b.organization_id IS DISTINCT FROM i.organization_id
  ),
  'provision_passport_cross_tenant', (
    SELECT count(*) FROM public.dpp_provision_batch_items bi
    JOIN public.dpp_provision_batches b ON b.id=bi.batch_id
    JOIN public.dpp_passports p ON p.id=bi.passport_id
    WHERE b.organization_id IS DISTINCT FROM p.organization_id
  ),
  'batch_serial_mismatch', (
    SELECT count(*) FROM public.dpp_provision_batch_items bi
    JOIN public.dpp_battery_items i ON i.id=bi.item_id
    WHERE bi.unique_identifier IS DISTINCT FROM i.unique_identifier
  ),
  'batch_passport_item_mismatch', (
    SELECT count(*) FROM public.dpp_provision_batch_items bi
    JOIN public.dpp_passports p ON p.id=bi.passport_id
    WHERE bi.item_id IS DISTINCT FROM p.battery_item_id
  ),
  'missing_serials', (
    SELECT count(*) FROM public.dpp_battery_items i
    WHERE i.unique_identifier IS NULL OR btrim(i.unique_identifier)=''
  ),
  'duplicate_serial_per_org', (
    SELECT count(*) FROM (
      SELECT organization_id,unique_identifier FROM public.dpp_battery_items
      GROUP BY 1,2 HAVING count(*)>1
    ) duplicates
  ),
  'duplicate_passport_version', (
    SELECT count(*) FROM (
      SELECT passport_id,version_no FROM public.dpp_passport_versions
      GROUP BY 1,2 HAVING count(*)>1
    ) duplicates
  ),
  'dpp_storage_metadata_objects', (SELECT count(*) FROM storage.objects WHERE bucket_id LIKE 'dpp%'),
  'storage_bytes_verified', FALSE,
  'warning', 'This query only checks database metadata and integrity. Actual Storage bytes need separate restore.'
)) AS dpp_restore_consistency_json;
ROLLBACK;
