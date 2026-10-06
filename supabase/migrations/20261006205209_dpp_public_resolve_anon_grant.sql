-- Reassert the public resolver privilege contract used by the public passport and QR flows.
revoke all on function public.dpp_api_passport_public_resolve(text) from public;
grant execute on function public.dpp_api_passport_public_resolve(text) to anon, authenticated;

do $grant$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.dpp_api_passport_public_resolve(text) to service_role';
  end if;
end
$grant$;
