-- R08 non-destructive organization deletion impact preview.
-- No destructive organization/user delete surface is introduced.

create or replace function public.dpp_api_org_deletion_impact()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_members bigint;
  v_member_users bigint;
  v_active_contexts bigint;
  v_models bigint;
  v_items bigint;
  v_passports bigint;
  v_versions bigint;
  v_import_mappings bigint;
  v_import_runs bigint;
  v_import_rows bigint;
  v_registry bigint;
  v_evidence bigint;
  v_evidence_bytes bigint;
  v_audit bigint;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);

  select count(*),count(distinct user_id)
    into v_members,v_member_users
  from public.dpp_organization_members
  where organization_id=v_org;

  select count(*) into v_active_contexts
  from public.dpp_user_tenant_context
  where active_organization_id=v_org;

  select count(*) into v_models from public.dpp_battery_models where organization_id=v_org;
  select count(*) into v_items from public.dpp_battery_items where organization_id=v_org;
  select count(*) into v_passports from public.dpp_passports where organization_id=v_org;
  select count(*) into v_versions from public.dpp_passport_versions where organization_id=v_org;
  select count(*) into v_import_mappings from public.dpp_import_mappings where organization_id=v_org;
  select count(*) into v_import_runs from public.dpp_import_runs where organization_id=v_org;

  select count(*) into v_import_rows
  from public.dpp_import_rows r
  join public.dpp_import_runs i on i.id=r.import_id
  where i.organization_id=v_org;

  select count(*) into v_registry from public.dpp_registry_submissions where organization_id=v_org;

  select count(*),coalesce(sum(byte_size),0)
    into v_evidence,v_evidence_bytes
  from public.dpp_evidence_attachments
  where organization_id=v_org;

  select count(*) into v_audit from public.dpp_audit_log where organization_id=v_org;

  return jsonb_build_object(
    'organization_id',v_org,
    'policy_version',3,
    'preview_only',true,
    'ready_for_destructive_delete',false,
    'destructive_surface_available',false,
    'counts',jsonb_build_object(
      'organization_members',v_members,
      'distinct_member_users',v_member_users,
      'active_tenant_contexts',v_active_contexts,
      'battery_models',v_models,
      'battery_items',v_items,
      'passports',v_passports,
      'passport_versions',v_versions,
      'import_mappings',v_import_mappings,
      'import_runs',v_import_runs,
      'import_rows',v_import_rows,
      'registry_submissions',v_registry,
      'evidence_metadata',v_evidence,
      'evidence_declared_bytes',v_evidence_bytes,
      'audit_rows',v_audit
    ),
    'external_objects',jsonb_build_object(
      'storage_bucket','dpp-evidence',
      'registered_object_count',v_evidence,
      'registered_declared_bytes',v_evidence_bytes,
      'storage_enumeration_required_before_delete',true
    ),
    'identity_boundary',jsonb_build_object(
      'organization_membership_rows',v_members,
      'distinct_auth_users_referenced',v_member_users,
      'auth_users_deleted_by_org_delete',false,
      'active_contexts_to_clear',v_active_contexts
    ),
    'blocker_codes',jsonb_build_array(
      'EXPORT_PACKAGE_ACCEPTANCE_PENDING',
      'PASSPORT_RETENTION_PERIOD_PENDING',
      'REGISTRY_RETENTION_TERMS_PENDING',
      'EVIDENCE_STORAGE_DELETE_LIFECYCLE_PENDING',
      'AUDIT_RETENTION_MINIMIZATION_PENDING',
      'AUTH_ACCOUNT_DELETE_WORKFLOW_PENDING'
    )
  );
end
$fn$;

revoke all on function public.dpp_api_org_deletion_impact() from public,anon;
grant execute on function public.dpp_api_org_deletion_impact() to authenticated;

comment on function public.dpp_api_org_deletion_impact() is
  'R08 precursor: owner/admin-only non-destructive organization deletion impact preview. It never deletes organization, auth, Storage or audit data.';
