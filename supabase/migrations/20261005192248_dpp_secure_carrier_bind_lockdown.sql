revoke execute on function public.dpp_api_carrier_bind(uuid,text,text,text,text) from authenticated;
comment on function public.dpp_api_carrier_bind(uuid,text,text,text,text) is
  'Internal carrier binding primitive. Authenticated clients must use dpp_api_carrier_bind_secure so public_url is server-derived.';
