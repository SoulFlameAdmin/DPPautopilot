create or replace function public.dpp_percent_encode_component(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path=pg_catalog,pg_temp
as $fn$
declare
  v_out text := '';
  v_char text;
  v_bytes bytea;
  v_i integer;
  v_j integer;
  v_byte integer;
begin
  if p_value is null then return null; end if;
  for v_i in 1..char_length(p_value) loop
    v_char := substr(p_value,v_i,1);
    if v_char ~ '^[A-Za-z0-9._~-]$' then
      v_out := v_out || v_char;
    else
      v_bytes := convert_to(v_char,'UTF8');
      for v_j in 0..length(v_bytes)-1 loop
        v_byte := get_byte(v_bytes,v_j);
        v_out := v_out || '%' || upper(lpad(to_hex(v_byte),2,'0'));
      end loop;
    end if;
  end loop;
  return v_out;
end
$fn$;

revoke all on function public.dpp_percent_encode_component(text) from public,anon,authenticated;

create or replace function public.dpp_api_carrier_bind_secure(
  p_battery_item_id uuid,
  p_carrier_kind text,
  p_nfc_technology text default null,
  p_external_uid text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_identifier text;
  v_public_url text;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  select i.unique_identifier
    into v_identifier
  from public.dpp_battery_items i
  where i.id=p_battery_item_id
    and i.organization_id=v_org;

  if not found then
    raise exception 'battery item not found in active organization' using errcode='DP706';
  end if;

  if p_carrier_kind not in ('qr','nfc') then
    raise exception 'unsupported carrier kind' using errcode='DP701';
  end if;

  v_public_url :=
    'https://dpp-autopilot.vercel.app/passport?identifier=' ||
    public.dpp_percent_encode_component(v_identifier) ||
    '&carrier=' || p_carrier_kind;

  return public.dpp_api_carrier_bind(
    p_battery_item_id,
    p_carrier_kind,
    v_public_url,
    p_nfc_technology,
    p_external_uid
  );
end
$fn$;

revoke all on function public.dpp_api_carrier_bind_secure(uuid,text,text,text) from public,anon;
grant execute on function public.dpp_api_carrier_bind_secure(uuid,text,text,text) to authenticated;
do $grant$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.dpp_api_carrier_bind_secure(uuid,text,text,text) to service_role;
  end if;
end
$grant$;

create or replace function public.dpp_api_carrier_scan_history(
  p_battery_item_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_result jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'scan history limit must be 1..500' using errcode='DP707';
  end if;

  if p_battery_item_id is not null and not exists (
    select 1
    from public.dpp_battery_items i
    where i.id=p_battery_item_id
      and i.organization_id=v_org
  ) then
    raise exception 'battery item not found in active organization' using errcode='DP706';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',x.id,
      'battery_item_id',x.battery_item_id,
      'unique_identifier',x.unique_identifier,
      'carrier_id',x.carrier_id,
      'source',x.source,
      'result',x.result,
      'occurred_at',x.occurred_at
    )
    order by x.occurred_at desc,x.id desc
  ),'[]'::jsonb)
  into v_result
  from (
    select e.id,e.battery_item_id,i.unique_identifier,e.carrier_id,e.source,e.result,e.occurred_at
    from public.dpp_carrier_scan_events e
    join public.dpp_battery_items i
      on i.organization_id=e.organization_id
     and i.id=e.battery_item_id
    where e.organization_id=v_org
      and (p_battery_item_id is null or e.battery_item_id=p_battery_item_id)
    order by e.occurred_at desc,e.id desc
    limit p_limit
  ) x;

  return v_result;
end
$fn$;

revoke all on function public.dpp_api_carrier_scan_history(uuid,integer) from public,anon;
grant execute on function public.dpp_api_carrier_scan_history(uuid,integer) to authenticated;
do $grant$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.dpp_api_carrier_scan_history(uuid,integer) to service_role;
  end if;
end
$grant$;

create index if not exists dpp_carrier_scan_history_lookup_idx
  on public.dpp_carrier_scan_events(organization_id,battery_item_id,occurred_at desc,id desc);

comment on function public.dpp_api_carrier_bind_secure(uuid,text,text,text) is
  'Production carrier binding: derives the canonical DPP URL from the tenant-scoped battery identifier; callers cannot supply an arbitrary carrier URL.';
comment on function public.dpp_api_carrier_scan_history(uuid,integer) is
  'Tenant-scoped carrier scan history for owner/admin/editor/viewer production UI.';
