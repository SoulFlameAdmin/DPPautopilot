-- M14: identifier uniqueness is defined in core schema; lifecycle transitions are enforced here.
-- These are application lifecycle rules, not a claim that EU law mandates this exact transition graph.

create or replace function public.dpp_lifecycle_transition_allowed(old_status text, new_status text)
returns boolean
language sql
immutable
strict
as $fn$
  select
    old_status = new_status
    or (old_status = 'original' and new_status in ('repurposed','remanufactured','second_life','waste','retired'))
    or (old_status = 'repurposed' and new_status in ('second_life','waste','retired'))
    or (old_status = 'remanufactured' and new_status in ('second_life','waste','retired'))
    or (old_status = 'second_life' and new_status in ('waste','retired'))
    or (old_status = 'waste' and new_status = 'retired');
$fn$;

create or replace function public.dpp_enforce_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.dpp_lifecycle_transition_allowed(old.lifecycle_status, new.lifecycle_status) then
    raise exception 'invalid DPP lifecycle transition: % -> %', old.lifecycle_status, new.lifecycle_status
      using errcode = '23514';
  end if;
  return new;
end
$fn$;

create trigger dpp_battery_item_lifecycle_guard
before update of lifecycle_status on public.dpp_battery_items
for each row execute function public.dpp_enforce_lifecycle_transition();

revoke all on function public.dpp_lifecycle_transition_allowed(text,text) from public, anon, authenticated;
revoke all on function public.dpp_enforce_lifecycle_transition() from public, anon, authenticated;
