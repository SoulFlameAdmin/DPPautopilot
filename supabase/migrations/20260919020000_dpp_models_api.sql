-- M17 partial precursor: authenticated tenant/RBAC-scoped battery-model CRUD RPCs.
-- M17 remains RED until M01/M03 are accepted and the HTTP API is runtime-integrated end-to-end.

create or replace function public.dpp_api_models_list()
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
        'id',m.id,
        'model_identifier',m.model_identifier,
        'manufacturer_name',m.manufacturer_name,
        'category',m.category,
        'canonical_data',m.canonical_data,
        'created_at',m.created_at,
        'updated_at',m.updated_at
      )
      order by m.model_identifier,m.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.dpp_battery_models m
  where m.organization_id=v_org;

  return v_result;
end
$fn$;

create or replace function public.dpp_api_models_create(
  p_model_identifier text,
  p_manufacturer_name text,
  p_category text,
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
  v_model public.dpp_battery_models%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_model_identifier is null or length(btrim(p_model_identifier)) not between 1 and 128 then
    raise exception 'model_identifier must contain 1..128 characters' using errcode='DP201';
  end if;
  if p_manufacturer_name is null or length(btrim(p_manufacturer_name)) not between 1 and 250 then
    raise exception 'manufacturer_name must contain 1..250 characters' using errcode='DP202';
  end if;
  if p_category is null or p_category not in (
    'portable','light_means_of_transport','starting_lighting_ignition',
    'industrial','electric_vehicle','other'
  ) then
    raise exception 'unsupported battery category' using errcode='DP203';
  end if;
  if p_canonical_data is null or jsonb_typeof(p_canonical_data)<>'object' then
    raise exception 'canonical_data must be a JSON object' using errcode='DP204';
  end if;

  insert into public.dpp_battery_models(
    organization_id,model_identifier,manufacturer_name,category,canonical_data,created_by
  ) values (
    v_org,btrim(p_model_identifier),btrim(p_manufacturer_name),p_category,p_canonical_data,v_user
  )
  returning * into v_model;

  return jsonb_build_object(
    'id',v_model.id,
    'model_identifier',v_model.model_identifier,
    'manufacturer_name',v_model.manufacturer_name,
    'category',v_model.category,
    'canonical_data',v_model.canonical_data,
    'created_at',v_model.created_at,
    'updated_at',v_model.updated_at
  );
end
$fn$;

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

  if p_id is null then
    raise exception 'model id is required' using errcode='DP205';
  end if;
  if p_model_identifier is not null and length(btrim(p_model_identifier)) not between 1 and 128 then
    raise exception 'model_identifier must contain 1..128 characters' using errcode='DP201';
  end if;
  if p_manufacturer_name is not null and length(btrim(p_manufacturer_name)) not between 1 and 250 then
    raise exception 'manufacturer_name must contain 1..250 characters' using errcode='DP202';
  end if;
  if p_category is not null and p_category not in (
    'portable','light_means_of_transport','starting_lighting_ignition',
    'industrial','electric_vehicle','other'
  ) then
    raise exception 'unsupported battery category' using errcode='DP203';
  end if;
  if p_canonical_data is not null and jsonb_typeof(p_canonical_data)<>'object' then
    raise exception 'canonical_data must be a JSON object' using errcode='DP204';
  end if;

  update public.dpp_battery_models m
  set model_identifier=coalesce(btrim(p_model_identifier),m.model_identifier),
      manufacturer_name=coalesce(btrim(p_manufacturer_name),m.manufacturer_name),
      category=coalesce(p_category,m.category),
      canonical_data=coalesce(p_canonical_data,m.canonical_data),
      updated_at=now()
  where m.id=p_id
    and m.organization_id=v_org
  returning * into v_model;

  if not found then
    raise exception 'battery model not found in active organization' using errcode='DP205';
  end if;

  return jsonb_build_object(
    'id',v_model.id,
    'model_identifier',v_model.model_identifier,
    'manufacturer_name',v_model.manufacturer_name,
    'category',v_model.category,
    'canonical_data',v_model.canonical_data,
    'created_at',v_model.created_at,
    'updated_at',v_model.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_models_delete(p_id uuid)
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
    raise exception 'model id is required' using errcode='DP205';
  end if;

  delete from public.dpp_battery_models m
  where m.id=p_id
    and m.organization_id=v_org
  returning m.id into v_deleted;

  if v_deleted is null then
    raise exception 'battery model not found in active organization' using errcode='DP205';
  end if;

  return v_deleted;
end
$fn$;

revoke all on function public.dpp_api_models_list() from public,anon;
revoke all on function public.dpp_api_models_create(text,text,text,jsonb) from public,anon;
revoke all on function public.dpp_api_models_update(uuid,text,text,text,jsonb) from public,anon;
revoke all on function public.dpp_api_models_delete(uuid) from public,anon;

grant execute on function public.dpp_api_models_list() to authenticated;
grant execute on function public.dpp_api_models_create(text,text,text,jsonb) to authenticated;
grant execute on function public.dpp_api_models_update(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.dpp_api_models_delete(uuid) to authenticated;

comment on function public.dpp_api_models_list() is
  'M17 precursor: list battery models only for the explicit active DPP tenant.';
comment on function public.dpp_api_models_create(text,text,text,jsonb) is
  'M17 precursor: create a model in the explicit active tenant with owner/admin/editor RBAC.';
comment on function public.dpp_api_models_update(uuid,text,text,text,jsonb) is
  'M17 precursor: update a model only inside the explicit active tenant with owner/admin/editor RBAC.';
comment on function public.dpp_api_models_delete(uuid) is
  'M17 precursor: delete a model only inside the explicit active tenant with owner/admin RBAC.';
