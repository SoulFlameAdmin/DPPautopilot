-- Reconstructed from bound Supabase source for applied migration dpp_registry_request_secret_guard.
-- R07 technical minimization precursor: request_payload only.

create or replace function public.dpp_json_has_credential_key(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path=public,pg_temp
as $fn$
declare
  v_type text;
  v_key text;
  v_child jsonb;
begin
  if p_value is null then return false; end if;
  v_type:=jsonb_typeof(p_value);
  if v_type='object' then
    for v_key,v_child in select key,value from jsonb_each(p_value)
    loop
      if lower(v_key) in (
        'password','passwd','secret','token','access_token','refresh_token',
        'authorization','api_key','apikey','supabase_key','client_secret',
        'credential','credentials'
      ) then return true; end if;
      if public.dpp_json_has_credential_key(v_child) then return true; end if;
    end loop;
    return false;
  elsif v_type='array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if public.dpp_json_has_credential_key(v_child) then return true; end if;
    end loop;
    return false;
  end if;
  return false;
end
$fn$;

create or replace function public.dpp_reject_registry_payload_credentials()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
begin
  if public.dpp_json_has_credential_key(new.request_payload) then
    raise exception 'registry request payload contains credential-bearing key'
      using errcode='23514';
  end if;
  return new;
end
$fn$;

drop trigger if exists dpp_registry_request_payload_privacy_guard
  on public.dpp_registry_submissions;

create trigger dpp_registry_request_payload_privacy_guard
before insert or update of request_payload
on public.dpp_registry_submissions
for each row execute function public.dpp_reject_registry_payload_credentials();

revoke all on function public.dpp_json_has_credential_key(jsonb) from public,anon,authenticated;
revoke all on function public.dpp_reject_registry_payload_credentials() from public,anon,authenticated;
