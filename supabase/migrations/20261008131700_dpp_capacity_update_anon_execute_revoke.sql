-- P0 platform-security hardening, stage 1.
-- Correct the explicit anonymous RPC grant observed on the bound DPP project.
-- The prior capacity-update migration revoked PUBLIC but did not necessarily revoke
-- a prior role-specific EXECUTE grant to anon. Anonymous calls must fail closed.
--
-- Non-destructive / repeatable privilege change. No table, row or data mutation.
-- Before production promotion: verify bound project, backup/restore readiness,
-- existing RPC signature and expected caller role under independent review.

-- Supabase runs each migration inside its own transaction; do not explicitly
-- BEGIN/COMMIT here or risk prematurely closing the migration runner's transaction.

do $guard$
begin
  if to_regprocedure('public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamp with time zone)') is null then
    raise exception 'DPP technical-pilot capacity RPC does not exist; refusing ACL migration';
  end if;
end
$guard$;

revoke all on function public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamptz)
  from public, anon;

grant execute on function public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamptz)
  to authenticated;

-- A failing assertion rolls back the entire migration rather than reporting
-- a false-green security change.
do $assert$
begin
  if has_function_privilege('anon',
       'public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamp with time zone)',
       'EXECUTE') then
    raise exception 'P0 SECURITY FAIL: anonymous role retains capacity update RPC EXECUTE';
  end if;
  if not has_function_privilege('authenticated',
       'public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamp with time zone)',
       'EXECUTE') then
    raise exception 'P0 SECURITY FAIL: authenticated capacity-update RPC permission was lost';
  end if;
end
$assert$;

