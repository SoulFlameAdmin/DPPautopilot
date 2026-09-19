-- Performance regression: DPP FK covering indexes flagged by Supabase advisor.
-- Exact index list keeps clean migration replay aligned with bound production hardening.

do $guard$
declare
  v_missing text[];
begin
  with expected(name) as (
    values
      ('dpp_battery_items_created_by_idx'),
      ('dpp_battery_items_org_model_idx'),
      ('dpp_battery_models_created_by_idx'),
      ('dpp_evidence_attachments_created_by_idx'),
      ('dpp_import_mappings_created_by_idx'),
      ('dpp_import_rows_committed_item_idx'),
      ('dpp_import_rows_committed_model_idx'),
      ('dpp_import_runs_created_by_idx'),
      ('dpp_import_runs_org_mapping_idx'),
      ('dpp_passport_versions_changed_by_idx'),
      ('dpp_passport_versions_organization_idx'),
      ('dpp_passports_created_by_idx'),
      ('dpp_registry_submissions_org_item_idx'),
      ('dpp_registry_submissions_org_passport_idx'),
      ('dpp_registry_submissions_created_by_idx'),
      ('dpp_user_tenant_context_membership_idx')
  )
  select array_agg(e.name order by e.name)
  into v_missing
  from expected e
  where not exists(
    select 1
    from pg_class i
    join pg_namespace n on n.oid=i.relnamespace
    join pg_index ix on ix.indexrelid=i.oid
    where n.nspname='public'
      and i.relname=e.name
      and ix.indisvalid
      and ix.indisready
  );

  if coalesce(array_length(v_missing,1),0)<>0 then
    raise exception 'Missing/invalid DPP FK covering indexes: %',v_missing;
  end if;
end
$guard$;

select 'DPP_FK_COVERING_INDEXES_PASS' as result;
