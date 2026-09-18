-- M13 partial precursor: tenant-scoped evidence attachment metadata and file-policy enforcement.
-- Real object upload/download is intentionally out of scope until M03 and the storage/API layer exist.

create table public.dpp_evidence_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  related_record_type text not null
    check (related_record_type in ('battery_model','battery_item','passport','registry_submission','import_run')),
  related_record_id uuid not null,
  storage_bucket text not null default 'dpp-evidence' check (storage_bucket='dpp-evidence'),
  storage_path text not null
    check (
      length(storage_path) between 3 and 600
      and storage_path like organization_id::text || '/%'
      and position('..' in storage_path)=0
    ),
  original_filename text not null check (length(btrim(original_filename)) between 1 and 240),
  content_type text not null
    check (content_type in ('application/pdf','image/png','image/jpeg','text/csv','application/json')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,storage_path)
);

create index dpp_evidence_attachments_target_idx
  on public.dpp_evidence_attachments(organization_id,related_record_type,related_record_id);

alter table public.dpp_evidence_attachments enable row level security;
revoke all on table public.dpp_evidence_attachments from anon,authenticated;

create or replace function public.dpp_validate_evidence_target()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_exists boolean := false;
begin
  case new.related_record_type
    when 'battery_model' then
      select exists(select 1 from public.dpp_battery_models where organization_id=new.organization_id and id=new.related_record_id) into v_exists;
    when 'battery_item' then
      select exists(select 1 from public.dpp_battery_items where organization_id=new.organization_id and id=new.related_record_id) into v_exists;
    when 'passport' then
      select exists(select 1 from public.dpp_passports where organization_id=new.organization_id and id=new.related_record_id) into v_exists;
    when 'registry_submission' then
      select exists(select 1 from public.dpp_registry_submissions where organization_id=new.organization_id and id=new.related_record_id) into v_exists;
    when 'import_run' then
      select exists(select 1 from public.dpp_import_runs where organization_id=new.organization_id and id=new.related_record_id) into v_exists;
  end case;

  if not v_exists then
    raise exception 'evidence target %/% not found in organization %',
      new.related_record_type,new.related_record_id,new.organization_id
      using errcode='23503';
  end if;

  new.updated_at:=now();
  return new;
end
$fn$;

create trigger dpp_evidence_validate_target
before insert or update on public.dpp_evidence_attachments
for each row execute function public.dpp_validate_evidence_target();

create policy dpp_evidence_member_select
on public.dpp_evidence_attachments for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));

create policy dpp_evidence_editor_insert
on public.dpp_evidence_attachments for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));

create policy dpp_evidence_editor_update
on public.dpp_evidence_attachments for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));

create policy dpp_evidence_admin_delete
on public.dpp_evidence_attachments for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create trigger dpp_audit_evidence_attachments
after insert or update or delete on public.dpp_evidence_attachments
for each row execute function public.dpp_capture_audit_event();

revoke all on function public.dpp_validate_evidence_target() from public,anon,authenticated;

comment on table public.dpp_evidence_attachments is
  'DPP evidence metadata precursor. Object bytes live outside PostgreSQL; storage upload/download enforcement is future M13 work.';
