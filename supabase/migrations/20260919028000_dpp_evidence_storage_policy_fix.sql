-- M13 storage policy fix: metadata-registration checks must not require direct table grants.
-- Keep dpp_evidence_attachments deny-by-default and expose only a boolean SECURITY DEFINER predicate.

create or replace function public.dpp_evidence_storage_registered(p_name text)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $fn$
  select exists(
    select 1
    from public.dpp_evidence_attachments a
    where a.organization_id=public.dpp_evidence_storage_org_id(p_name)
      and a.storage_bucket='dpp-evidence'
      and a.storage_path=p_name
  );
$fn$;

revoke all on function public.dpp_evidence_storage_registered(text) from public,anon;
grant execute on function public.dpp_evidence_storage_registered(text) to authenticated;

do $storage$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'M13_STORAGE_SCHEMA_UNAVAILABLE_SKIP';
    return;
  end if;

  execute 'drop policy if exists dpp_evidence_storage_member_select on storage.objects';
  execute 'drop policy if exists dpp_evidence_storage_editor_insert on storage.objects';

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
      and public.dpp_evidence_storage_registered(name)
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
      and public.dpp_evidence_storage_registered(name)
    )
  $policy$;
end
$storage$;

comment on function public.dpp_evidence_storage_registered(text) is
  'Returns whether an evidence Storage object path has a matching DPP evidence metadata row without granting direct table access.';
