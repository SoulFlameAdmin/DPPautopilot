-- BAT05: canonical catalog access enforcement at the database boundary.
-- The seed below is generated from data/dpp-field-catalog.json and parity-tested in CI.

create table public.dpp_field_catalog_runtime (
  field_path text primary key,
  access_level text not null
    check (access_level in ('public','public_identifier','legitimate_interest','authority_only')),
  catalog_version text not null,
  synced_at timestamptz not null default now()
);

alter table public.dpp_field_catalog_runtime enable row level security;
revoke all on table public.dpp_field_catalog_runtime from anon,authenticated;

-- BAT05_RUNTIME_ACCESS_MAP_BEGIN
insert into public.dpp_field_catalog_runtime(field_path,access_level,catalog_version)
select x.path,x.access,'2026-09-18'
from jsonb_to_recordset($catalog$
[{"path":"model.identification.manufacturer.name","access":"public"},{"path":"model.identification.manufacturer.postal_address","access":"public"},{"path":"model.identification.manufacturer.contact","access":"public"},{"path":"model.identification.category","access":"public"},{"path":"model.identification.model_id","access":"public"},{"path":"model.identification.place_of_manufacture","access":"public"},{"path":"model.identification.date_of_manufacture","access":"public"},{"path":"model.physical.weight_kg","access":"public"},{"path":"model.rated_capacity_ah","access":"public"},{"path":"model.composition.chemistry","access":"public"},{"path":"model.composition.hazardous_substances","access":"public"},{"path":"model.safety.usable_extinguishing_agent","access":"public"},{"path":"model.composition.critical_raw_materials","access":"public"},{"path":"model.carbon_footprint","access":"public"},{"path":"model.responsible_sourcing","access":"public"},{"path":"model.recycled_content","access":"public"},{"path":"model.renewable_content_share","access":"public"},{"path":"model.voltage","access":"public"},{"path":"model.power_capability","access":"public"},{"path":"model.expected_lifetime","access":"public"},{"path":"model.exhaustion_capacity_threshold","access":"public"},{"path":"model.storage_temperature","access":"public"},{"path":"model.warranty_calendar_life","access":"public"},{"path":"model.energy_efficiency","access":"public"},{"path":"model.internal_resistance","access":"public"},{"path":"model.c_rate_test","access":"public"},{"path":"model.markings","access":"public"},{"path":"model.eu_declaration_of_conformity","access":"public"},{"path":"model.waste_information","access":"public"},{"path":"model.restricted_composition","access":"legitimate_interest"},{"path":"model.spares","access":"legitimate_interest"},{"path":"model.disassembly","access":"legitimate_interest"},{"path":"model.safety_measures","access":"legitimate_interest"},{"path":"model.compliance_test_reports","access":"authority_only"},{"path":"item.unique_identifier","access":"public_identifier"},{"path":"item.performance_history","access":"legitimate_interest"},{"path":"item.state_of_health","access":"legitimate_interest"},{"path":"item.lifecycle_status","access":"legitimate_interest"},{"path":"item.usage.cycles","access":"legitimate_interest"},{"path":"item.usage.events","access":"legitimate_interest"},{"path":"item.telemetry.environment","access":"legitimate_interest"},{"path":"item.telemetry.state_of_charge","access":"legitimate_interest"}]
$catalog$::jsonb) as x(path text,access text)
on conflict(field_path) do update
set access_level=excluded.access_level,
    catalog_version=excluded.catalog_version,
    synced_at=now();
-- BAT05_RUNTIME_ACCESS_MAP_END

create or replace function public.dpp_enforce_field_event_catalog_access()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_expected text;
begin
  select c.access_level
    into v_expected
  from public.dpp_field_catalog_runtime c
  where c.field_path=new.field_path;

  if v_expected is null then
    raise exception 'field_path is not present in the canonical DPP catalog'
      using errcode='23514';
  end if;

  if new.access_level<>v_expected then
    raise exception 'field-event access class does not match canonical catalog'
      using errcode='23514';
  end if;

  return new;
end
$fn$;

revoke all on function public.dpp_enforce_field_event_catalog_access() from public,anon,authenticated;

drop trigger if exists dpp_field_events_catalog_access on public.dpp_field_events;
create trigger dpp_field_events_catalog_access
before insert on public.dpp_field_events
for each row execute function public.dpp_enforce_field_event_catalog_access();

comment on table public.dpp_field_catalog_runtime is
  'BAT05 internal runtime projection of canonical field path -> access class; deny-by-default and CI-parity checked against data/dpp-field-catalog.json.';
comment on function public.dpp_enforce_field_event_catalog_access() is
  'BAT05 fail-closed database enforcement that every field event uses the canonical access class for its field_path.';
