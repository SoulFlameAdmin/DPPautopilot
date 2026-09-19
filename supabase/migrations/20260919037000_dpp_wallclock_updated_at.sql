-- M23 concurrency token hardening.
-- Use wall-clock timestamps for mutable API records so updated_at changes even across multiple writes in one transaction.

create or replace function public.dpp_api_models_update(
  p_id uuid,
  p_model_identifier text default null,
  p_manufacturer_name text default null,
  p_category text default null,
  p_canonical_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_model public.dpp_battery_models%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  if p_id is null then raise exception 'model id is required' using errcode='DP205'; end if;
  if p_model_identifier is not null and length(btrim(p_model_identifier)) not between 1 and 128 then
    raise exception 'model_identifier must contain 1..128 characters' using errcode='DP201';
  end if;
  if p_manufacturer_name is not null and length(btrim(p_manufacturer_name)) not between 1 and 250 then
    raise exception 'manufacturer_name must contain 1..250 characters' using errcode='DP202';
  end if;
  if p_category is not null and p_category not in (
    'portable','light_means_of_transport','starting_lighting_ignition',
    'industrial','electric_vehicle','other'
  ) then raise exception 'unsupported battery category' using errcode='DP203'; end if;
  if p_canonical_data is not null and jsonb_typeof(p_canonical_data)<>'object' then
    raise exception 'canonical_data must be a JSON object' using errcode='DP204';
  end if;

  update public.dpp_battery_models m
  set model_identifier=coalesce(btrim(p_model_identifier),m.model_identifier),
      manufacturer_name=coalesce(btrim(p_manufacturer_name),m.manufacturer_name),
      category=coalesce(p_category,m.category),
      canonical_data=coalesce(p_canonical_data,m.canonical_data),
      updated_at=clock_timestamp()
  where m.id=p_id and m.organization_id=v_org
  returning * into v_model;

  if not found then raise exception 'battery model not found in active organization' using errcode='DP205'; end if;

  return jsonb_build_object(
    'id',v_model.id,'model_identifier',v_model.model_identifier,
    'manufacturer_name',v_model.manufacturer_name,'category',v_model.category,
    'canonical_data',v_model.canonical_data,'created_at',v_model.created_at,'updated_at',v_model.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_items_update(
  p_id uuid,
  p_model_id uuid default null,
  p_unique_identifier text default null,
  p_lifecycle_status text default null,
  p_canonical_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_item public.dpp_battery_items%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  if p_id is null then raise exception 'item id is required' using errcode='DP306'; end if;

  select * into v_item from public.dpp_battery_items i
  where i.id=p_id and i.organization_id=v_org;
  if not found then raise exception 'battery item not found in active organization' using errcode='DP306'; end if;

  if p_model_id is not null and not exists (
    select 1 from public.dpp_battery_models m where m.id=p_model_id and m.organization_id=v_org
  ) then raise exception 'battery model not found in active organization' using errcode='DP305'; end if;
  if p_unique_identifier is not null and length(btrim(p_unique_identifier)) not between 1 and 300 then
    raise exception 'unique_identifier must contain 1..300 characters' using errcode='DP301';
  end if;
  if p_lifecycle_status is not null and p_lifecycle_status not in (
    'original','repurposed','remanufactured','second_life','waste','retired'
  ) then raise exception 'unsupported lifecycle status' using errcode='DP302'; end if;
  if p_lifecycle_status is not null
     and not public.dpp_lifecycle_transition_allowed(v_item.lifecycle_status,p_lifecycle_status) then
    raise exception 'invalid lifecycle transition: % -> %',v_item.lifecycle_status,p_lifecycle_status using errcode='DP307';
  end if;
  if p_canonical_data is not null and jsonb_typeof(p_canonical_data)<>'object' then
    raise exception 'canonical_data must be a JSON object' using errcode='DP303';
  end if;

  update public.dpp_battery_items i
  set model_id=coalesce(p_model_id,i.model_id),
      unique_identifier=coalesce(btrim(p_unique_identifier),i.unique_identifier),
      lifecycle_status=coalesce(p_lifecycle_status,i.lifecycle_status),
      canonical_data=coalesce(p_canonical_data,i.canonical_data),
      updated_at=clock_timestamp()
  where i.id=p_id and i.organization_id=v_org
  returning * into v_item;

  return jsonb_build_object(
    'id',v_item.id,'model_id',v_item.model_id,'unique_identifier',v_item.unique_identifier,
    'lifecycle_status',v_item.lifecycle_status,'canonical_data',v_item.canonical_data,
    'created_at',v_item.created_at,'updated_at',v_item.updated_at
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
  if p_id is null then raise exception 'passport id is required' using errcode='DP403'; end if;
  if p_status is not null and p_status not in ('draft','active','suspended','retired') then
    raise exception 'unsupported passport status' using errcode='DP408';
  end if;
  if p_public_payload is not null and jsonb_typeof(p_public_payload)<>'object' then
    raise exception 'public_payload must be a JSON object' using errcode='DP406';
  end if;
  if p_private_payload is not null and jsonb_typeof(p_private_payload)<>'object' then
    raise exception 'private_payload must be a JSON object' using errcode='DP407';
  end if;

  select i.unique_identifier into v_identifier
  from public.dpp_passports p
  join public.dpp_battery_items i on i.id=p.battery_item_id and i.organization_id=p.organization_id
  where p.id=p_id and p.organization_id=v_org;
  if v_identifier is null then raise exception 'passport not found in active organization' using errcode='DP403'; end if;

  if p_public_payload is not null then
    perform public.dpp_assert_public_passport_payload_safe(p_public_payload,v_identifier);
  end if;

  update public.dpp_passports p
  set status=coalesce(p_status,p.status),
      public_payload=coalesce(p_public_payload,p.public_payload),
      private_payload=coalesce(p_private_payload,p.private_payload),
      updated_at=clock_timestamp()
  where p.id=p_id and p.organization_id=v_org
  returning * into v_passport;

  return jsonb_build_object(
    'passport_id',v_passport.id,'battery_item_id',v_passport.battery_item_id,
    'status',v_passport.status,'public_payload',v_passport.public_payload,
    'private_payload',v_passport.private_payload,'created_at',v_passport.created_at,'updated_at',v_passport.updated_at
  );
end
$fn$;

-- Preserve the M23 bypass prohibition after replacing the underlying functions.
revoke execute on function public.dpp_api_models_update(uuid,text,text,text,jsonb) from authenticated;
revoke execute on function public.dpp_api_items_update(uuid,uuid,text,text,jsonb) from authenticated;
revoke execute on function public.dpp_api_passport_update(uuid,text,jsonb,jsonb) from authenticated;
