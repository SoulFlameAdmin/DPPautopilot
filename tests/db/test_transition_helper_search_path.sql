-- Security regression for DPP transition helpers.
-- Ensures both helpers keep a fixed search_path after clean migration replay.

do $guard$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('dpp_lifecycle_transition_allowed','dpp_registry_status_transition_allowed')
    and not ('search_path=public, pg_temp'=any(coalesce(p.proconfig,array[]::text[])));

  if v_bad<>0 then
    raise exception 'DPP transition helper mutable search_path count=%',v_bad;
  end if;
end
$guard$;

select 'DPP_TRANSITION_HELPER_SEARCH_PATH_PASS' as result;
