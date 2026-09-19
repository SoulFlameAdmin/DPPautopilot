-- DPP performance hardening: add covering indexes for foreign keys flagged by Supabase advisor.
-- These indexes do not change data semantics or client privileges.

create index if not exists dpp_battery_items_created_by_idx
  on public.dpp_battery_items(created_by);
create index if not exists dpp_battery_items_org_model_idx
  on public.dpp_battery_items(organization_id,model_id);

create index if not exists dpp_battery_models_created_by_idx
  on public.dpp_battery_models(created_by);

create index if not exists dpp_evidence_attachments_created_by_idx
  on public.dpp_evidence_attachments(created_by);

create index if not exists dpp_import_mappings_created_by_idx
  on public.dpp_import_mappings(created_by);

create index if not exists dpp_import_rows_committed_item_idx
  on public.dpp_import_rows(committed_item_id);
create index if not exists dpp_import_rows_committed_model_idx
  on public.dpp_import_rows(committed_model_id);

create index if not exists dpp_import_runs_created_by_idx
  on public.dpp_import_runs(created_by);
create index if not exists dpp_import_runs_org_mapping_idx
  on public.dpp_import_runs(organization_id,mapping_id);

create index if not exists dpp_passport_versions_changed_by_idx
  on public.dpp_passport_versions(changed_by);
create index if not exists dpp_passport_versions_organization_idx
  on public.dpp_passport_versions(organization_id);

create index if not exists dpp_passports_created_by_idx
  on public.dpp_passports(created_by);

create index if not exists dpp_registry_submissions_org_item_idx
  on public.dpp_registry_submissions(organization_id,battery_item_id);
create index if not exists dpp_registry_submissions_org_passport_idx
  on public.dpp_registry_submissions(organization_id,passport_id);
create index if not exists dpp_registry_submissions_created_by_idx
  on public.dpp_registry_submissions(created_by);

create index if not exists dpp_user_tenant_context_membership_idx
  on public.dpp_user_tenant_context(user_id,active_organization_id);
