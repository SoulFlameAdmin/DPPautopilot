-- M07: tenant-scoped saved CSV mapping profiles.

create table public.dpp_import_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  source_format text not null default 'csv' check (source_format in ('csv')),
  source_headers jsonb not null check (jsonb_typeof(source_headers)='array'),
  field_mapping jsonb not null check (jsonb_typeof(field_mapping)='object'),
  revision integer not null default 1 check (revision > 0),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name),
  unique (organization_id,id)
);

comment on table public.dpp_import_mappings is 'Tenant-scoped reusable CSV source-column to canonical DPP field mappings.';

alter table public.dpp_import_mappings enable row level security;
revoke all on table public.dpp_import_mappings from anon,authenticated;

create or replace function public.dpp_touch_import_mapping_revision()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
begin
  if new.source_headers is distinct from old.source_headers
     or new.field_mapping is distinct from old.field_mapping
     or new.name is distinct from old.name then
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  return new;
end
$fn$;

create trigger dpp_import_mapping_revision
before update on public.dpp_import_mappings
for each row execute function public.dpp_touch_import_mapping_revision();

revoke all on function public.dpp_touch_import_mapping_revision() from public,anon,authenticated;
