-- M13 authenticated Evidence Edge bridge metadata lookup.
-- Preserve deny-by-default table grants: expose only the minimal object integrity tuple
-- through a tenant-aware SECURITY DEFINER RPC.

create or replace function public.dpp_api_evidence_object_metadata(
  p_storage_path text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_result jsonb;
begin
  if public.dpp_request_user_id() is null then
    raise exception 'authenticated user context is required'
      using errcode='DP101';
  end if;

  v_org:=public.dpp_evidence_storage_org_id(p_storage_path);
  if v_org is null then
    return null;
  end if;

  if not public.dpp_has_org_role(
    v_org,
    array['owner','admin','editor','viewer']
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'byte_size',a.byte_size,
    'sha256_hex',a.sha256_hex,
    'content_type',a.content_type
  )
  into v_result
  from public.dpp_evidence_attachments a
  where a.organization_id=v_org
    and a.storage_bucket='dpp-evidence'
    and a.storage_path=p_storage_path;

  return v_result;
end
$fn$;

revoke all on function public.dpp_api_evidence_object_metadata(text) from public,anon;
grant execute on function public.dpp_api_evidence_object_metadata(text) to authenticated;

comment on function public.dpp_api_evidence_object_metadata(text) is
  'M13 minimal tenant-aware evidence integrity metadata RPC for caller-JWT Edge bridge; returns only byte_size, sha256_hex and content_type.';
