-- M19/M10 API-boundary public passport policy hardening.
-- Keeps restricted catalog classes out of the public passport payload.

create or replace function public.dpp_assert_public_passport_payload_safe(
  p_payload jsonb,
  p_expected_identifier text
)
returns void
language plpgsql
immutable
set search_path=public,pg_temp
as $fn$
declare
  v_key text;
  v_model jsonb;
  v_item jsonb;
  v_ident jsonb;
  v_manufacturer jsonb;
  v_physical jsonb;
  v_safety jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'public_payload must be a JSON object' using errcode='DP406';
  end if;

  for v_key in select jsonb_object_keys(p_payload) loop
    if v_key not in ('model','item') then
      raise exception 'public_payload contains non-public root key: %',v_key using errcode='DP409';
    end if;
  end loop;

  v_model:=coalesce(p_payload->'model','{}'::jsonb);
  v_item:=coalesce(p_payload->'item','{}'::jsonb);

  if jsonb_typeof(v_model)<>'object' or jsonb_typeof(v_item)<>'object' then
    raise exception 'public_payload model/item must be JSON objects' using errcode='DP409';
  end if;

  for v_key in select jsonb_object_keys(v_model) loop
    if v_key not in (
      'identification','physical','rated_capacity_ah','composition','safety',
      'carbon_footprint','responsible_sourcing','recycled_content',
      'renewable_content_share','voltage','power_capability','expected_lifetime',
      'exhaustion_capacity_threshold','storage_temperature','warranty_calendar_life',
      'energy_efficiency','internal_resistance','c_rate_test','markings',
      'eu_declaration_of_conformity','waste_information'
    ) then
      raise exception 'public_payload model field is not public-classified: %',v_key using errcode='DP409';
    end if;
  end loop;

  for v_key in select jsonb_object_keys(v_item) loop
    if v_key <> 'unique_identifier' then
      raise exception 'public_payload item field is not public-classified: %',v_key using errcode='DP409';
    end if;
  end loop;

  v_ident:=coalesce(v_model->'identification','{}'::jsonb);
  if jsonb_typeof(v_ident)<>'object' then
    raise exception 'model.identification must be an object' using errcode='DP409';
  end if;
  for v_key in select jsonb_object_keys(v_ident) loop
    if v_key not in ('manufacturer','category','model_id','place_of_manufacture','date_of_manufacture') then
      raise exception 'model.identification field is not public-classified: %',v_key using errcode='DP409';
    end if;
  end loop;

  v_manufacturer:=coalesce(v_ident->'manufacturer','{}'::jsonb);
  if jsonb_typeof(v_manufacturer)<>'object' then
    raise exception 'model.identification.manufacturer must be an object' using errcode='DP409';
  end if;
  for v_key in select jsonb_object_keys(v_manufacturer) loop
    if v_key not in ('name','postal_address','contact') then
      raise exception 'manufacturer field is not public-classified: %',v_key using errcode='DP409';
    end if;
  end loop;

  v_physical:=coalesce(v_model->'physical','{}'::jsonb);
  if jsonb_typeof(v_physical)<>'object' then
    raise exception 'model.physical must be an object' using errcode='DP409';
  end if;
  for v_key in select jsonb_object_keys(v_physical) loop
    if v_key <> 'weight_kg' then
      raise exception 'model.physical field is not public-classified: %',v_key using errcode='DP409';
    end if;
  end loop;

  v_safety:=coalesce(v_model->'safety','{}'::jsonb);
  if jsonb_typeof(v_safety)<>'object' then
    raise exception 'model.safety must be an object' using errcode='DP409';
  end if;
  for v_key in select jsonb_object_keys(v_safety) loop
    if v_key <> 'usable_extinguishing_agent' then
      raise exception 'model.safety field is not public-classified: %',v_key using errcode='DP409';
    end if;
  end loop;

  if v_item ? 'unique_identifier'
     and (jsonb_typeof(v_item->'unique_identifier')<>'string'
          or v_item->>'unique_identifier'<>p_expected_identifier) then
    raise exception 'public item.unique_identifier must match battery item' using errcode='DP410';
  end if;
end
$fn$;

revoke all on function public.dpp_assert_public_passport_payload_safe(jsonb,text)
from public,anon,authenticated;

create or replace function public.dpp_api_passport_create(
  p_battery_item_id uuid,
  p_public_payload jsonb default '{}'::jsonb,
  p_private_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_identifier text;
  v_passport public.dpp_passports%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_battery_item_id is null then
    raise exception 'battery_item_id is required' using errcode='DP404';
  end if;

  select i.unique_identifier
  into v_identifier
  from public.dpp_battery_items i
  where i.id=p_battery_item_id and i.organization_id=v_org;

  if v_identifier is null then
    raise exception 'battery item not found in active organization' using errcode='DP405';
  end if;
  if p_public_payload is null or jsonb_typeof(p_public_payload)<>'object' then
    raise exception 'public_payload must be a JSON object' using errcode='DP406';
  end if;
  if p_private_payload is null or jsonb_typeof(p_private_payload)<>'object' then
    raise exception 'private_payload must be a JSON object' using errcode='DP407';
  end if;

  perform public.dpp_assert_public_passport_payload_safe(p_public_payload,v_identifier);

  insert into public.dpp_passports(
    organization_id,battery_item_id,status,public_payload,private_payload,created_by
  ) values (
    v_org,p_battery_item_id,'draft',p_public_payload,p_private_payload,v_user
  )
  returning * into v_passport;

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'battery_item_id',v_passport.battery_item_id,
    'status',v_passport.status,
    'public_payload',v_passport.public_payload,
    'private_payload',v_passport.private_payload,
    'created_at',v_passport.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_passport_update(
  p_id uuid,
  p_status text default null,
  p_public_payload jsonb default null,
  p_private_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_identifier text;
  v_passport public.dpp_passports%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  if p_id is null then
    raise exception 'passport id is required' using errcode='DP403';
  end if;
  if p_status is not null and p_status not in ('draft','active','suspended','retired') then
    raise exception 'unsupported passport status' using errcode='DP408';
  end if;
  if p_public_payload is not null and jsonb_typeof(p_public_payload)<>'object' then
    raise exception 'public_payload must be a JSON object' using errcode='DP406';
  end if;
  if p_private_payload is not null and jsonb_typeof(p_private_payload)<>'object' then
    raise exception 'private_payload must be a JSON object' using errcode='DP407';
  end if;

  select i.unique_identifier
  into v_identifier
  from public.dpp_passports p
  join public.dpp_battery_items i
    on i.id=p.battery_item_id and i.organization_id=p.organization_id
  where p.id=p_id and p.organization_id=v_org;

  if v_identifier is null then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;

  if p_public_payload is not null then
    perform public.dpp_assert_public_passport_payload_safe(p_public_payload,v_identifier);
  end if;

  update public.dpp_passports p
  set status=coalesce(p_status,p.status),
      public_payload=coalesce(p_public_payload,p.public_payload),
      private_payload=coalesce(p_private_payload,p.private_payload),
      updated_at=now()
  where p.id=p_id and p.organization_id=v_org
  returning * into v_passport;

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'battery_item_id',v_passport.battery_item_id,
    'status',v_passport.status,
    'public_payload',v_passport.public_payload,
    'private_payload',v_passport.private_payload,
    'created_at',v_passport.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;
