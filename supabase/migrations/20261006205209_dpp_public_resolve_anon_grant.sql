-- Reassert the public resolver privilege contract when the resolver already exists.
-- On clean replay the lifecycle/resolver substrate is created by the following migration.

do $grant$
begin
  if to_regprocedure('public.dpp_api_passport_public_resolve(text)') is not null then
    execute 'revoke all on function public.dpp_api_passport_public_resolve(text) from public';
    execute 'grant execute on function public.dpp_api_passport_public_resolve(text) to anon, authenticated';
    if exists (select 1 from pg_roles where rolname='service_role') then
      execute 'grant execute on function public.dpp_api_passport_public_resolve(text) to service_role';
    end if;
  end if;
end
$grant$;
