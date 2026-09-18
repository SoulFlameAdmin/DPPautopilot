-- M18 partial precursor: authenticated tenant/RBAC-scoped battery-item CRUD RPCs.
-- M18 remains RED until M01/M03 are accepted and deployed end-to-end API acceptance is possible.

create or replace function public.dpp_api_items_list()
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',i.id,
        'model_id',i.model_id,
        'unique_identifier',i.unique_identifier,
        'lifecycle_status',i.lifecycle_status,
        'canonical_data',i.canonical_data,
        'created_at',i.created_at,
        'updated_at',i.updated_at
      )
      order by i.unique_identifier,i.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.dpp_battery_items i
  where i.organization_id=v_org;

  return v_result;
end
$fn$;

create or replace function public.dpp_api_items_create(
  p_model_id uuid,
  p_unique_identifier text,
  p_lifecycle_status text default 'original',
  p_canonical_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_item public.dpp_battery_items%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_model_id is null then
    raise exception 'model_id is required' using errcode='DP304';
  end if;
  if not exists (
    select 1 from public.dpp_battery_models m
    where m.id=p_model_id and m.organization_id=v_org
  ) then
    raise exception 'battery model not found in active organization' using errcode='DP305';
  end if;
  if p_unique_identifier is null or length(btrim(p_unique_identifier)) not between 1 and 300 then
    raise exception 'unique_identifier must contain 1..300 characters' using errcode='DP301';
  end if;
  if p_lifecycle_status is null or p_lifecycle_status not in (
    'original','repurposed','remanufactured','second_life','waste','retired'
  ) then
    raise exception 'unsupported lifecycle status' using errcode='DP302';
  end if;
  if p_canonical_data is null or jsonb_typeof(p_canonical_data)<>'object' then
    raise exception 'canonical_data must be a JSON object' using errcode='DP303';
  end if;

  insert into public.dpp_battery_items(
    organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by
  ) values (
    v_org,p_model_id,btrim(p_unique_identifier),p_lifecycle_status,p_canonical_data,v_user
  )
  returning * into v_item;

  return jsonb_build_object(
    'id',v_item.id,
    'model_id',v_item.model_id,
    'unique_identifier',v_item.unique_identifier,
    'lifecycle_status',v_item.lifecycle_status,
    'canonical_data',v_item.canonical_data,
    'created_at',v_item.created_at,
    'updated_at',v_item.updated_at
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

  if p_id is null then
    raise exception 'item id is required' using errcode='DP306';
  end if;

  select *
  into v_item
  from public.dpp_battery_items i
  where i.id=p_id and i.organization_id=v_org;

  if not found then
    raise exception 'battery item not found in active organization' using errcode='DP306';
  end if;

  if p_model_id is not null and not exists (
    select 1 from public.dpp_battery_models m
    where m.id=p_model_id and m.organization_id=v_org
  ) then
    raise exception 'battery model not found in active organization' using errcode='DP305';
  end if;
  if p_unique_identifier is not null and length(btrim(p_unique_identifier)) not between 1 and 300 then
    raise exception 'unique_identifier must contain 1..300 characters' using errcode='DP301';
  end if;
  if p_lifecycle_status is not null and p_lifecycle_status not in (
    'original','repurposed','remanufactured','second_life','waste','retired'
  ) then
    raise exception 'unsupported lifecycle status' using errcode='DP302';
  end if;
  if p_lifecycle_status is not null
     and not public.dpp_lifecycle_transition_allowed(v_item.lifecycle_status,p_lifecycle_status) then
    raise exception 'invalid lifecycle transition: % -> %',v_item.lifecycle_status,p_lifecycle_status
      using errcode='DP307';
  end if;
  if p_canonical_data is not null and jsonb_typeof(p_canonical_data)<>'object' then
    raise exception 'canonical_data must be a JSON object' using errcode='DP303';
  end if;

  update public.dpp_battery_items i
  set model_id=coalesce(p_model_id,i.model_id),
      unique_identifier=coalesce(btrim(p_unique_identifier),i.unique_identifier),
      lifecycle_status=coalesce(p_lifecycle_status,i.lifecycle_status),
      canonical_data=coalesce(p_canonical_data,i.canonical_data),
      updated_at=now()
  where i.id=p_id and i.organization_id=v_org
  returning * into v_item;

  return jsonb_build_object(
    'id',v_item.id,
    'model_id',v_item.model_id,
    'unique_identifier',v_item.unique_identifier,
    'lifecycle_status',v_item.lifecycle_status,
    'canonical_data',v_item.canonical_data,
    'created_at',v_item.created_at,
    'updated_at',v_item.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_items_delete(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_deleted uuid;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);

  if p_id is null then
    raise exception 'item id is required' using errcode='DP306';
  end if;

  if not exists (
    select 1 from public.dpp_battery_items i
    where i.id=p_id and i.organization_id=v_org
  ) then
    raise exception 'battery item not found in active organization' using errcode='DP306';
  end if;

  if exists (
    select 1 from public.dpp_passports p
    where p.battery_item_id=p_id and p.organization_id=v_org
  ) then
    raise exception 'battery item has a passport and cannot be deleted' using errcode='DP308';
  end if;

  delete from public.dpp_battery_items i
  where i.id=p_id and i.organization_id=v_org
  returning i.id into v_deleted;

  return v_deleted;
end
$fn$;

revoke all on function public.dpp_api_items_list() from public,anon;
revoke all on function public.dpp_api_items_create(uuid,text,text,jsonb) from public,anon;
revoke all on function public.dpp_api_items_update(uuid,uuid,text,text,jsonb) from public,anon;
revoke all on function public.dpp_api_items_delete(uuid) from public,anon;

grant execute on function public.dpp_api_items_list() to authenticated;
grant execute on function public.dpp_api_items_create(uuid,text,text,jsonb) to authenticated;
grant execute on function public.dpp_api_items_update(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.dpp_api_items_delete(uuid) to authenticated;

comment on function public.dpp_api_items_list() is
  'M18 precursor: list battery items only for the explicit active DPP tenant.';
comment on function public.dpp_api_items_create(uuid,text,text,jsonb) is
  'M18 precursor: create an item linked to a model in the explicit active tenant.';
comment on function public.dpp_api_items_update(uuid,uuid,text,text,jsonb) is
  'M18 precursor: update a tenant item with model-link and lifecycle enforcement.';
comment on function public.dpp_api_items_delete(uuid) is
  'M18 precursor: delete only un-passported items in the active tenant with owner/admin RBAC.';
