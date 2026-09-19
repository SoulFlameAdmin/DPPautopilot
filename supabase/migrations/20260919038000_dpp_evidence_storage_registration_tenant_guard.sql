-- M13 security hardening: authenticated direct calls to the metadata-registration helper
-- must not reveal whether an object path exists outside the caller's organisations.

create or replace function public.dpp_evidence_storage_registered(p_name text)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $fn$
  select
    public.dpp_evidence_storage_org_id(p_name) is not null
    and public.dpp_has_org_role(
      public.dpp_evidence_storage_org_id(p_name),
      array['owner','admin','editor','viewer']
    )
    and exists(
      select 1
      from public.dpp_evidence_attachments a
      where a.organization_id=public.dpp_evidence_storage_org_id(p_name)
        and a.storage_bucket='dpp-evidence'
        and a.storage_path=p_name
    );
$fn$;

revoke all on function public.dpp_evidence_storage_registered(text) from public,anon;
grant execute on function public.dpp_evidence_storage_registered(text) to authenticated;

comment on function public.dpp_evidence_storage_registered(text) is
  'Tenant-aware evidence Storage registration predicate; returns false unless the caller belongs to the path organisation and matching metadata exists.';
