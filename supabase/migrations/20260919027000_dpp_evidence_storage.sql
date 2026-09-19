-- M13 storage precursor: private Supabase Storage bucket + tenant/RBAC object policies.
-- Bucket restrictions are enforced by Supabase Storage API; object rows must match pre-registered DPP evidence metadata.
-- On vanilla PostgreSQL CI (no storage schema), hosted-specific DDL is intentionally skipped.

create or replace function public.dpp_evidence_storage_org_id(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_first text;
begin
  if p_name is null or length(p_name) < 38 or length(p_name) > 600 or position('..' in p_name) > 0 then
    return null;
  end if;
  v_first:=split_part(p_name,'/',1);
  if v_first !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_first::uuid;
exception when invalid_text_representation then
  return null;
end
$fn$;

revoke all on function public.dpp_evidence_storage_org_id(text) from public,anon;
grant execute on function public.dpp_evidence_storage_org_id(text) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'M13_STORAGE_SCHEMA_UNAVAILABLE_SKIP';
    return;
  end if;

  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values(
    'dpp-evidence',
    'dpp-evidence',
    false,
    10485760,
    array['application/pdf','image/png','image/jpeg','text/csv','application/json']::text[]
  )
  on conflict(id) do update
    set name=excluded.name,
        public=false,
        file_size_limit=excluded.file_size_limit,
        allowed_mime_types=excluded.allowed_mime_types;

  execute 'drop policy if exists dpp_evidence_storage_member_select on storage.objects';
  execute 'drop policy if exists dpp_evidence_storage_editor_insert on storage.objects';
  execute 'drop policy if exists dpp_evidence_storage_admin_delete on storage.objects';
  execute 'drop policy if exists dpp_evidence_storage_update_denied on storage.objects';

  execute $policy$
    create policy dpp_evidence_storage_member_select
    on storage.objects for select to authenticated
    using (
      bucket_id='dpp-evidence'
      and public.dpp_evidence_storage_org_id(name) is not null
      and public.dpp_has_org_role(
        public.dpp_evidence_storage_org_id(name),
        array['owner','admin','editor','viewer']
      )
      and exists(
        select 1
        from public.dpp_evidence_attachments a
        where a.organization_id=public.dpp_evidence_storage_org_id(name)
          and a.storage_bucket='dpp-evidence'
          and a.storage_path=storage.objects.name
      )
    )
  $policy$;

  execute $policy$
    create policy dpp_evidence_storage_editor_insert
    on storage.objects for insert to authenticated
    with check (
      bucket_id='dpp-evidence'
      and public.dpp_evidence_storage_org_id(name) is not null
      and public.dpp_has_org_role(
        public.dpp_evidence_storage_org_id(name),
        array['owner','admin','editor']
      )
      and exists(
        select 1
        from public.dpp_evidence_attachments a
        where a.organization_id=public.dpp_evidence_storage_org_id(name)
          and a.storage_bucket='dpp-evidence'
          and a.storage_path=storage.objects.name
      )
    )
  $policy$;

  execute $policy$
    create policy dpp_evidence_storage_admin_delete
    on storage.objects for delete to authenticated
    using (
      bucket_id='dpp-evidence'
      and public.dpp_evidence_storage_org_id(name) is not null
      and public.dpp_has_org_role(
        public.dpp_evidence_storage_org_id(name),
        array['owner','admin']
      )
    )
  $policy$;

  -- Deliberately no UPDATE policy: overwriting object bytes can invalidate stored SHA-256 metadata.
end
$storage$;

comment on function public.dpp_evidence_storage_org_id(text) is
  'Extracts a safe organization UUID from the first evidence-object path segment; returns null for malformed/unsafe paths.';
