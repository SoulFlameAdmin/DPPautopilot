-- BAT01 canonical access-class parity.
-- The field catalog treats public_identifier as a first-class public access class.
-- Keep the append-only field event store aligned with the canonical catalog.

alter table public.dpp_field_events
  drop constraint if exists dpp_field_events_access_level_check;

alter table public.dpp_field_events
  add constraint dpp_field_events_access_level_check
  check (access_level in ('public','public_identifier','legitimate_interest','authority_only'));

comment on constraint dpp_field_events_access_level_check on public.dpp_field_events is
  'Canonical DPP access classes mirrored from data/dpp-field-catalog.json.';
