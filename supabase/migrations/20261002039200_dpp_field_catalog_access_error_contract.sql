-- BAT05: normalize canonical field-access rejection to stable DP706.
-- The previous runtime catalog migration intentionally failed closed with 23514.
-- This corrective migration keeps the same enforcement but gives callers and tests
-- one stable error contract for both unknown fields and mismatched access classes.

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
      using errcode='DP706';
  end if;

  if new.access_level<>v_expected then
    raise exception 'field-event access class does not match canonical catalog'
      using errcode='DP706';
  end if;

  return new;
end
$fn$;

revoke all on function public.dpp_enforce_field_event_catalog_access() from public,anon,authenticated;

comment on function public.dpp_enforce_field_event_catalog_access() is
  'BAT05 fail-closed canonical field/access enforcement with stable DP706 for unknown fields or access mismatch.';
