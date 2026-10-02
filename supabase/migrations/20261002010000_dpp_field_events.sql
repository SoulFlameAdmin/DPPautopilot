-- BAT01-BAT09 Battery Platform V3 field-level provenance/history precursor.
-- Append-only per-field events: value + source + source date + access + verification.
-- This does not replace canonical model/item/passport projections; it provides the
-- immutable evidence/history layer from which projections can be derived.

create table public.dpp_field_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('model','item','passport')),
  subject_id uuid not null,
  field_path text not null check (length(btrim(field_path)) between 1 and 300),
  value jsonb not null,
  source_kind text not null check (source_kind in ('manual','csv','xlsx','api','bms','derived','migration')),
  source_ref text not null check (length(btrim(source_ref)) between 1 and 1000),
  source_date timestamptz not null,
  access_level text not null check (access_level in ('public','legitimate_interest','authority_only')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','validated','verified','rejected')),
  supersedes_id uuid null references public.dpp_field_events(id) on delete restrict,
  recorded_by uuid null references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint dpp_field_events_not_self_superseding check (supersedes_id is null or supersedes_id <> id),
  unique (organization_id, id)
);

create index dpp_field_events_subject_field_time_idx
  on public.dpp_field_events(organization_id, subject_kind, subject_id, field_path, recorded_at desc, id desc);

comment on table public.dpp_field_events is
  'Append-only DPP field value events carrying provenance, source date, access class, verification state and supersession history.';

alter table public.dpp_field_events enable row level security;
revoke all on table public.dpp_field_events from anon, authenticated;

create or replace function public.dpp_reject_field_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'dpp_field_events is append-only; append a superseding event instead'
    using errcode = '55000';
end;
$$;

revoke all on function public.dpp_reject_field_event_mutation() from public, anon, authenticated;

create trigger dpp_field_events_append_only
before update or delete on public.dpp_field_events
for each row execute function public.dpp_reject_field_event_mutation();
