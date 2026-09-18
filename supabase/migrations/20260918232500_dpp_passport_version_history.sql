-- M11: immutable passport version history.

create table public.dpp_passport_versions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  passport_id uuid not null references public.dpp_passports(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  status text not null,
  public_payload jsonb not null check (jsonb_typeof(public_payload) = 'object'),
  private_payload jsonb not null check (jsonb_typeof(private_payload) = 'object'),
  changed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (passport_id, version_no)
);

comment on table public.dpp_passport_versions is 'Append-only immutable snapshots of DPP passport material state.';

alter table public.dpp_passport_versions enable row level security;
revoke all on table public.dpp_passport_versions from anon, authenticated;

create or replace function public.dpp_capture_passport_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  next_version integer;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.public_payload is not distinct from old.public_payload
     and new.private_payload is not distinct from old.private_payload then
    return new;
  end if;

  select coalesce(max(version_no), 0) + 1
    into next_version
  from public.dpp_passport_versions
  where passport_id = new.id;

  insert into public.dpp_passport_versions (
    organization_id, passport_id, version_no, status,
    public_payload, private_payload, changed_by
  )
  values (
    new.organization_id, new.id, next_version, new.status,
    new.public_payload, new.private_payload, new.created_by
  );

  return new;
end
$fn$;

create trigger dpp_passport_version_capture
after insert or update of status, public_payload, private_payload
on public.dpp_passports
for each row execute function public.dpp_capture_passport_version();

create or replace function public.dpp_reject_passport_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  raise exception 'dpp_passport_versions is append-only';
end
$fn$;

create trigger dpp_passport_versions_immutable
before update or delete on public.dpp_passport_versions
for each row execute function public.dpp_reject_passport_version_mutation();

revoke all on function public.dpp_capture_passport_version() from public, anon, authenticated;
revoke all on function public.dpp_reject_passport_version_mutation() from public, anon, authenticated;
