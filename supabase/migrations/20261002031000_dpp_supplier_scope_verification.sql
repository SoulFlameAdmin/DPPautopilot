-- BAT54/BAT57 Supplier Network exact scoping + verification ledger.
-- This migration extends supplier packages with unambiguous product scope and
-- keeps verification state changes append-only instead of mutating packages.

alter table public.dpp_supplier_data_packages
  add column model_id uuid null,
  add column item_id uuid null,
  add column component_ref text null,
  add column material_ref text null;

alter table public.dpp_supplier_data_packages
  add constraint dpp_supplier_packages_org_model_fk
    foreign key (organization_id, model_id)
    references public.dpp_battery_models(organization_id, id)
    on delete restrict,
  add constraint dpp_supplier_packages_org_item_fk
    foreign key (organization_id, item_id)
    references public.dpp_battery_items(organization_id, id)
    on delete restrict,
  add constraint dpp_supplier_packages_component_ref_check
    check (component_ref is null or length(btrim(component_ref)) between 1 and 200),
  add constraint dpp_supplier_packages_material_ref_check
    check (material_ref is null or length(btrim(material_ref)) between 1 and 200),
  add constraint dpp_supplier_packages_exact_scope_check
    check (
      (subject_kind = 'model'
        and model_id is not null
        and item_id is null
        and component_ref is null
        and material_ref is null)
      or
      (subject_kind = 'item'
        and model_id is null
        and item_id is not null
        and component_ref is null
        and material_ref is null)
      or
      (subject_kind = 'component'
        and component_ref is not null
        and material_ref is null
        and ((model_id is not null and item_id is null)
          or (model_id is null and item_id is not null)))
      or
      (subject_kind = 'material'
        and material_ref is not null
        and ((model_id is not null and item_id is null)
          or (model_id is null and item_id is not null)))
    );

create index dpp_supplier_packages_model_scope_idx
  on public.dpp_supplier_data_packages(organization_id, model_id, created_at desc)
  where model_id is not null;

create index dpp_supplier_packages_item_scope_idx
  on public.dpp_supplier_data_packages(organization_id, item_id, created_at desc)
  where item_id is not null;

create table public.dpp_supplier_package_verification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  package_id uuid not null,
  status text not null check (status in ('validated','verified','rejected')),
  evidence_ref text not null check (length(btrim(evidence_ref)) between 1 and 1000),
  note text null check (note is null or length(note) <= 2000),
  recorded_by uuid null references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint dpp_supplier_verification_org_package_fk
    foreign key (organization_id, package_id)
    references public.dpp_supplier_data_packages(organization_id, id)
    on delete restrict
);

create index dpp_supplier_verification_package_time_idx
  on public.dpp_supplier_package_verification_events(
    organization_id, package_id, recorded_at desc, id desc
  );

alter table public.dpp_supplier_package_verification_events enable row level security;
revoke all on table public.dpp_supplier_package_verification_events from anon, authenticated;

create or replace function public.dpp_reject_supplier_verification_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  raise exception 'dpp_supplier_package_verification_events is append-only'
    using errcode = '55000';
end;
$fn$;

revoke all on function public.dpp_reject_supplier_verification_mutation() from public, anon, authenticated;

create trigger dpp_supplier_package_verification_append_only
before update or delete on public.dpp_supplier_package_verification_events
for each row execute function public.dpp_reject_supplier_verification_mutation();

create view public.dpp_supplier_package_latest_verification as
select distinct on (organization_id, package_id)
  organization_id,
  package_id,
  status,
  evidence_ref,
  note,
  recorded_by,
  recorded_at
from public.dpp_supplier_package_verification_events
order by organization_id, package_id, recorded_at desc, id desc;

revoke all on public.dpp_supplier_package_latest_verification from public, anon, authenticated;

comment on table public.dpp_supplier_package_verification_events is
  'Append-only verification decisions for supplier data packages with evidence references.';
