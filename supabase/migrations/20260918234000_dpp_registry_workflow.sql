-- M15/M16: registry workflow abstraction and status tracking.
-- This schema does not claim live connectivity to the EU DPP Registry.
-- It models a provider-neutral test/live submission lifecycle for later adapters.

create table public.dpp_registry_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  battery_item_id uuid not null,
  passport_id uuid not null,
  environment text not null default 'test' check (environment in ('test','live')),
  provider text not null default 'eu_dpp_registry' check (length(btrim(provider)) between 1 and 80),
  status text not null default 'draft' check (
    status in ('draft','queued','submitted','accepted','rejected','retry_wait','failed','cancelled')
  ),
  request_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(request_payload)='object'),
  response_payload jsonb null check (response_payload is null or jsonb_typeof(response_payload)='object'),
  external_reference text null check (external_reference is null or length(external_reference) <= 300),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text null check (last_error_code is null or length(last_error_code) <= 120),
  last_error_message text null check (last_error_message is null or length(last_error_message) <= 2000),
  queued_at timestamptz null,
  submitted_at timestamptz null,
  accepted_at timestamptz null,
  rejected_at timestamptz null,
  next_retry_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpp_registry_org_item_fk
    foreign key (organization_id, battery_item_id)
    references public.dpp_battery_items(organization_id, id)
    on delete cascade,
  constraint dpp_registry_org_passport_fk
    foreign key (organization_id, passport_id)
    references public.dpp_passports(organization_id, id)
    on delete cascade
);

create index dpp_registry_submissions_org_status_idx
  on public.dpp_registry_submissions(organization_id,status,created_at desc);

alter table public.dpp_registry_submissions enable row level security;
revoke all on table public.dpp_registry_submissions from anon, authenticated;

create or replace function public.dpp_registry_status_transition_allowed(old_status text,new_status text)
returns boolean
language sql
immutable
strict
as $fn$
  select
    old_status=new_status
    or (old_status='draft' and new_status in ('queued','cancelled'))
    or (old_status='queued' and new_status in ('submitted','cancelled','failed'))
    or (old_status='submitted' and new_status in ('accepted','rejected','retry_wait','failed'))
    or (old_status='rejected' and new_status in ('retry_wait','cancelled'))
    or (old_status='retry_wait' and new_status in ('queued','cancelled','failed'));
$fn$;

create or replace function public.dpp_enforce_registry_status_transition()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
begin
  if not public.dpp_registry_status_transition_allowed(old.status,new.status) then
    raise exception 'invalid DPP registry status transition: % -> %',old.status,new.status
      using errcode='23514';
  end if;

  if old.status is distinct from new.status then
    new.updated_at := now();
    if new.status='queued' and new.queued_at is null then new.queued_at := now(); end if;
    if new.status='submitted' and new.submitted_at is null then
      new.submitted_at := now();
      new.attempt_count := old.attempt_count + 1;
    end if;
    if new.status='accepted' and new.accepted_at is null then new.accepted_at := now(); end if;
    if new.status='rejected' and new.rejected_at is null then new.rejected_at := now(); end if;
  end if;
  return new;
end
$fn$;

create trigger dpp_registry_status_guard
before update of status on public.dpp_registry_submissions
for each row execute function public.dpp_enforce_registry_status_transition();

revoke all on function public.dpp_registry_status_transition_allowed(text,text) from public,anon,authenticated;
revoke all on function public.dpp_enforce_registry_status_transition() from public,anon,authenticated;
