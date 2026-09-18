-- M21 partial precursor: tenant-scoped administrative export bundle.
-- M21 remains RED until M10-M13 are fully accepted and deployed E2E export acceptance is proven.

create or replace function public.dpp_api_export_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_org_row jsonb;
  v_models jsonb;
  v_items jsonb;
  v_passports jsonb;
  v_versions jsonb;
  v_audit jsonb;
  v_evidence jsonb;
begin
  -- Full/private export is intentionally limited to tenant owner/admin.
  v_org:=public.dpp_require_active_role(array['owner','admin']);

  select to_jsonb(o)
    into v_org_row
  from public.dpp_organizations o
  where o.id=v_org;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.model_identifier,x.id),'[]'::jsonb)
    into v_models
  from (
    select m.*
    from public.dpp_battery_models m
    where m.organization_id=v_org
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.unique_identifier,x.id),'[]'::jsonb)
    into v_items
  from (
    select i.*
    from public.dpp_battery_items i
    where i.organization_id=v_org
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]'::jsonb)
    into v_passports
  from (
    select p.*
    from public.dpp_passports p
    where p.organization_id=v_org
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.passport_id,x.version_no),'[]'::jsonb)
    into v_versions
  from (
    select v.*
    from public.dpp_passport_versions v
    where v.organization_id=v_org
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at,x.id),'[]'::jsonb)
    into v_audit
  from (
    select a.*
    from public.dpp_audit_log a
    where a.organization_id=v_org
  ) x;

  -- Manifest metadata only. Object bytes are deliberately not exported by this DB RPC.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',e.id,
        'related_record_type',e.related_record_type,
        'related_record_id',e.related_record_id,
        'storage_bucket',e.storage_bucket,
        'storage_path',e.storage_path,
        'original_filename',e.original_filename,
        'content_type',e.content_type,
        'byte_size',e.byte_size,
        'sha256_hex',e.sha256_hex,
        'metadata',e.metadata,
        'created_by',e.created_by,
        'created_at',e.created_at,
        'updated_at',e.updated_at
      )
      order by e.created_at,e.id
    ),
    '[]'::jsonb
  )
  into v_evidence
  from public.dpp_evidence_attachments e
  where e.organization_id=v_org;

  return jsonb_build_object(
    'schema_version',1,
    'organization_id',v_org,
    'organization',v_org_row,
    'generated_at',now(),
    'records',jsonb_build_object(
      'battery_models',v_models,
      'battery_items',v_items,
      'passports',v_passports,
      'passport_versions',v_versions,
      'audit_log',v_audit
    ),
    'evidence_manifest',v_evidence,
    'counts',jsonb_build_object(
      'battery_models',jsonb_array_length(v_models),
      'battery_items',jsonb_array_length(v_items),
      'passports',jsonb_array_length(v_passports),
      'passport_versions',jsonb_array_length(v_versions),
      'audit_log',jsonb_array_length(v_audit),
      'evidence_manifest',jsonb_array_length(v_evidence)
    )
  );
end
$fn$;

revoke all on function public.dpp_api_export_bundle() from public,anon;
grant execute on function public.dpp_api_export_bundle() to authenticated;

comment on function public.dpp_api_export_bundle() is
  'M21 precursor: owner/admin-only active-tenant export of DPP records/history plus evidence metadata manifest; no object bytes.';
