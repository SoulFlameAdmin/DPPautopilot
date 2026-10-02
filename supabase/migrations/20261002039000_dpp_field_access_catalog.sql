-- BAT05: database-enforced canonical field access catalog.
-- The canonical JSON catalog remains the product source of truth; this migration
-- binds its current field_path/access pairs into PostgreSQL so direct RPC/DB
-- ingestion cannot bypass catalog access classification.

create table public.dpp_field_catalog_access (
  field_path text primary key,
  access_level text not null
    check (access_level in ('public','public_identifier','legitimate_interest','authority_only')),
  catalog_version text not null,
  unique(field_path,access_level)
);

insert into public.dpp_field_catalog_access(field_path,access_level,catalog_version)
values
  ('model.identification.manufacturer.name','public','2026-09-18'),
  ('model.identification.manufacturer.postal_address','public','2026-09-18'),
  ('model.identification.manufacturer.contact','public','2026-09-18'),
  ('model.identification.category','public','2026-09-18'),
  ('model.identification.model_id','public','2026-09-18'),
  ('model.identification.place_of_manufacture','public','2026-09-18'),
  ('model.identification.date_of_manufacture','public','2026-09-18'),
  ('model.physical.weight_kg','public','2026-09-18'),
  ('model.rated_capacity_ah','public','2026-09-18'),
  ('model.composition.chemistry','public','2026-09-18'),
  ('model.composition.hazardous_substances','public','2026-09-18'),
  ('model.safety.usable_extinguishing_agent','public','2026-09-18'),
  ('model.composition.critical_raw_materials','public','2026-09-18'),
  ('model.carbon_footprint','public','2026-09-18'),
  ('model.responsible_sourcing','public','2026-09-18'),
  ('model.recycled_content','public','2026-09-18'),
  ('model.renewable_content_share','public','2026-09-18'),
  ('model.voltage','public','2026-09-18'),
  ('model.power_capability','public','2026-09-18'),
  ('model.expected_lifetime','public','2026-09-18'),
  ('model.exhaustion_capacity_threshold','public','2026-09-18'),
  ('model.storage_temperature','public','2026-09-18'),
  ('model.warranty_calendar_life','public','2026-09-18'),
  ('model.energy_efficiency','public','2026-09-18'),
  ('model.internal_resistance','public','2026-09-18'),
  ('model.c_rate_test','public','2026-09-18'),
  ('model.markings','public','2026-09-18'),
  ('model.eu_declaration_of_conformity','public','2026-09-18'),
  ('model.waste_information','public','2026-09-18'),
  ('model.restricted_composition','legitimate_interest','2026-09-18'),
  ('model.spares','legitimate_interest','2026-09-18'),
  ('model.disassembly','legitimate_interest','2026-09-18'),
  ('model.safety_measures','legitimate_interest','2026-09-18'),
  ('model.compliance_test_reports','authority_only','2026-09-18'),
  ('item.unique_identifier','public_identifier','2026-09-18'),
  ('item.performance_history','legitimate_interest','2026-09-18'),
  ('item.state_of_health','legitimate_interest','2026-09-18'),
  ('item.lifecycle_status','legitimate_interest','2026-09-18'),
  ('item.usage.cycles','legitimate_interest','2026-09-18'),
  ('item.usage.events','legitimate_interest','2026-09-18'),
  ('item.telemetry.environment','legitimate_interest','2026-09-18'),
  ('item.telemetry.state_of_charge','legitimate_interest','2026-09-18');

alter table public.dpp_field_catalog_access enable row level security;
revoke all on table public.dpp_field_catalog_access from anon,authenticated;

create or replace function public.dpp_enforce_field_event_catalog_access()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $fn$
begin
  if not exists (
    select 1
    from public.dpp_field_catalog_access c
    where c.field_path=new.field_path
      and c.access_level=new.access_level
  ) then
    raise exception 'field access does not match canonical catalog: % / %',
      new.field_path,new.access_level
      using errcode='DP706';
  end if;
  return new;
end
$fn$;

revoke all on function public.dpp_enforce_field_event_catalog_access() from public,anon,authenticated;

create trigger dpp_field_events_catalog_access
before insert on public.dpp_field_events
for each row execute function public.dpp_enforce_field_event_catalog_access();

comment on table public.dpp_field_catalog_access is
  'BAT05 DB enforcement snapshot of canonical data/dpp-field-catalog.json field_path/access pairs.';
comment on function public.dpp_enforce_field_event_catalog_access() is
  'BAT05 rejects field events whose access class does not match the canonical catalog.';
