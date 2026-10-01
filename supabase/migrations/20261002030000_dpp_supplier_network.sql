-- BAT51/BAT53/BAT55 Supplier Network foundation.
-- Tenant-scoped suppliers plus append-only versioned supplier data packages.

create table public.dpp_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  external_ref text not null check (length(btrim(external_ref)) between 1 and 200),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 250),
  status text not null default 'active' check (status in ('active','suspended','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_ref),
  unique (organization_id, id)
);

create index dpp_suppliers_org_status_idx
  on public.dpp_suppliers(organization_id, status, legal_name);

create table public.dpp_supplier_data_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  supplier_id uuid not null,
  subject_kind text not null check (subject_kind in ('model','item','component','material')),
  subject_ref text not null check (length(btrim(subject_ref)) between 1 and 300),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  source_date timestamptz not null,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','validated','verified','rejected')),
  supersedes_id uuid null references public.dpp_supplier_data_packages(id) on delete restrict,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint dpp_supplier_packages_org_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.dpp_suppliers(organization_id, id)
    on delete restrict,
  constraint dpp_supplier_packages_not_self_superseding
    check (supersedes_id is null or supersedes_id <> id)
);

create index dpp_supplier_packages_org_supplier_time_idx
  on public.dpp_supplier_data_packages(organization_id, supplier_id, created_at desc, id desc);

create index dpp_supplier_packages_subject_time_idx
  on public.dpp_supplier_data_packages(organization_id, subject_kind, subject_ref, created_at desc, id desc);

create index dpp_supplier_packages_supersedes_idx
  on public.dpp_supplier_data_packages(supersedes_id)
  where supersedes_id is not null;

comment on table public.dpp_suppliers is
  'Tenant-scoped supplier registry for Battery Trust OS supplier data exchange.';

comment on table public.dpp_supplier_data_packages is
  'Append-only supplier-provided DPP data snapshots with provenance and supersession history.';

alter table public.dpp_suppliers enable row level security;
alter table public.dpp_supplier_data_packages enable row level security;

revoke all on table public.dpp_suppliers from anon, authenticated;
revoke all on table public.dpp_supplier_data_packages from anon, authenticated;

create or replace function public.dpp_reject_supplier_package_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  raise exception 'dpp_supplier_data_packages is append-only; append a superseding package instead'
    using errcode = '55000';
end;
$fn$;

revoke all on function public.dpp_reject_supplier_package_mutation() from public, anon, authenticated;

create trigger dpp_supplier_data_packages_append_only
before update or delete on public.dpp_supplier_data_packages
for each row execute function public.dpp_reject_supplier_package_mutation();
