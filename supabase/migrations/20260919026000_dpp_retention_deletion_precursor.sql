-- R08 partial: fail-closed retention/deletion precursor.
-- Implements bounded cleanup only for terminal import staging.
-- Organization/user destructive deletion remains deliberately disabled until storage/audit/auth retention blockers are accepted.

create or replace function public.dpp_api_retention_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_terminal_imports bigint;
  v_nonterminal_old_imports bigint;
  v_passports bigint;
  v_versions bigint;
  v_registry bigint;
  v_evidence bigint;
  v_audit bigint;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);

  select count(*) into v_terminal_imports
  from public.dpp_import_runs r
  where r.organization_id=v_org
    and r.status in ('invalid','committed')
    and r.updated_at < now()-interval '30 days';

  select count(*) into v_nonterminal_old_imports
  from public.dpp_import_runs r
  where r.organization_id=v_org
    and r.status in ('staged','validated')
    and r.updated_at < now()-interval '30 days';

  select count(*) into v_passports
  from public.dpp_passports p
  where p.organization_id=v_org;

  select count(*) into v_versions
  from public.dpp_passport_versions v
  where v.organization_id=v_org;

  select count(*) into v_registry
  from public.dpp_registry_submissions s
  where s.organization_id=v_org;

  select count(*) into v_evidence
  from public.dpp_evidence_attachments e
  where e.organization_id=v_org;

  select count(*) into v_audit
  from public.dpp_audit_log a
  where a.organization_id=v_org;

  return jsonb_build_object(
    'organization_id',v_org,
    'policy_version',1,
    'organization_deletion_enabled',false,
    'export_required_before_org_deletion',true,
    'import_staging',jsonb_build_object(
      'minimum_age_days',30,
      'eligible_terminal_runs',v_terminal_imports,
      'old_nonterminal_runs_preserved',v_nonterminal_old_imports
    ),
    'blocking_counts',jsonb_build_object(
      'passports',v_passports,
      'passport_versions',v_versions,
      'registry_submissions',v_registry,
      'evidence_metadata',v_evidence,
      'audit_rows',v_audit
    ),
    'blockers',jsonb_build_array(
      'full_export_including_evidence_objects_not_proven',
      'passport_history_retention_period_not_accepted',
      'registry_retention_and_external_recipient_terms_not_accepted',
      'evidence_storage_deletion_lifecycle_not_accepted',
      'audit_retention_minimization_exception_not_accepted',
      'auth_account_deletion_workflow_not_accepted'
    )
  );
end
$fn$;

create or replace function public.dpp_api_purge_import_staging(
  p_before timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_deleted bigint;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);

  if p_before is null then
    raise exception 'retention cutoff is required'
      using errcode='DP501';
  end if;

  if p_before > now()-interval '30 days' then
    raise exception 'retention cutoff must be at least 30 days old'
      using errcode='DP502';
  end if;

  with deleted as (
    delete from public.dpp_import_runs r
    where r.organization_id=v_org
      and r.status in ('invalid','committed')
      and r.updated_at < p_before
    returning r.id
  )
  select count(*) into v_deleted from deleted;

  return jsonb_build_object(
    'organization_id',v_org,
    'policy_version',1,
    'action','purge_terminal_import_staging',
    'cutoff',p_before,
    'deleted_runs',v_deleted,
    'preserved_statuses',jsonb_build_array('staged','validated'),
    'audit_exception','dpp_import_runs DELETE events remain in immutable dpp_audit_log'
  );
end
$fn$;

revoke all on function public.dpp_api_retention_status() from public,anon;
revoke all on function public.dpp_api_purge_import_staging(timestamptz) from public,anon;
grant execute on function public.dpp_api_retention_status() to authenticated;
grant execute on function public.dpp_api_purge_import_staging(timestamptz) to authenticated;

comment on function public.dpp_api_retention_status() is
  'R08 precursor: owner/admin retention/deletion readiness summary. Organization deletion remains fail-closed.';
comment on function public.dpp_api_purge_import_staging(timestamptz) is
  'R08 precursor: owner/admin purge of terminal invalid/committed import staging older than the 30-day minimum; in-progress imports are preserved.';
