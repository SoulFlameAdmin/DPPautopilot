-- Manufacturer Pilot V1: generic atomic battery provisioning for all supported battery categories.
-- Keeps the existing LMT/scooter RPCs intact for backwards compatibility.

create or replace function public.dpp_api_battery_provision(
  p_model_id uuid,
  p_unique_identifier text,
  p_item_canonical_data jsonb default '{}'::jsonb,
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
  v_model public.dpp_battery_models%rowtype;
  v_item public.dpp_battery_items%rowtype;
  v_passport public.dpp_passports%rowtype;
  v_created_item boolean := false;
  v_created_passport boolean := false;
  v_public_category text;
  v_public_model_id text;
  v_public_manufacturer text;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_model_id is null then
    raise exception 'model_id is required' using errcode='DP603';
  end if;

  v_identifier:=btrim(coalesce(p_unique_identifier,''));
  if length(v_identifier) not between 1 and 300
     or v_identifier ~ '[[:cntrl:]]' then
    raise exception 'unique_identifier must contain 1..300 printable characters'
      using errcode='DP603';
  end if;

  if p_item_canonical_data is null or jsonb_typeof(p_item_canonical_data)<>'object'
     or p_public_payload is null or jsonb_typeof(p_public_payload)<>'object'
     or p_private_payload is null or jsonb_typeof(p_private_payload)<>'object' then
    raise exception 'provisioning payloads must be JSON objects' using errcode='DP603';
  end if;

  select m.* into v_model
  from public.dpp_battery_models m
  where m.id=p_model_id and m.organization_id=v_org
  for share;

  if not found then
    raise exception 'battery model not found in active organization' using errcode='DP601';
  end if;

  if p_public_payload#>>'{item,unique_identifier}' is null
     or p_public_payload#>>'{item,unique_identifier}'<>v_identifier then
    raise exception 'public item.unique_identifier must match provisioned battery identifier'
      using errcode='DP603';
  end if;

  v_public_category:=p_public_payload#>>'{model,identification,category}';
  if v_public_category is not null and v_public_category<>v_model.category then
    raise exception 'public model category must match the selected battery model'
      using errcode='DP603';
  end if;

  v_public_model_id:=p_public_payload#>>'{model,identification,model_id}';
  if v_public_model_id is not null and v_public_model_id<>v_model.model_identifier then
    raise exception 'public model id must match the selected battery model'
      using errcode='DP603';
  end if;

  v_public_manufacturer:=p_public_payload#>>'{model,identification,manufacturer,name}';
  if v_public_manufacturer is not null and v_public_manufacturer<>v_model.manufacturer_name then
    raise exception 'public manufacturer must match the selected battery model'
      using errcode='DP603';
  end if;

  perform public.dpp_assert_public_passport_payload_safe(p_public_payload,v_identifier);

  select i.* into v_item
  from public.dpp_battery_items i
  where i.unique_identifier=v_identifier
  for update;

  if found then
    if v_item.organization_id<>v_org
       or v_item.model_id<>p_model_id
       or v_item.lifecycle_status<>'original'
       or v_item.canonical_data<>p_item_canonical_data then
      raise exception 'battery identifier already belongs to a different item state'
        using errcode='DP604';
    end if;
  else
    insert into public.dpp_battery_items(
      organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by
    ) values (
      v_org,p_model_id,v_identifier,'original',p_item_canonical_data,v_user
    )
    on conflict (unique_identifier) do nothing
    returning * into v_item;

    if found then
      v_created_item:=true;
    else
      select i.* into v_item
      from public.dpp_battery_items i
      where i.unique_identifier=v_identifier
      for update;

      if not found
         or v_item.organization_id<>v_org
         or v_item.model_id<>p_model_id
         or v_item.lifecycle_status<>'original'
         or v_item.canonical_data<>p_item_canonical_data then
        raise exception 'battery identifier already belongs to a different item state'
          using errcode='DP604';
      end if;
    end if;
  end if;

  select p.* into v_passport
  from public.dpp_passports p
  where p.organization_id=v_org
    and p.battery_item_id=v_item.id
  for update;

  if found then
    if v_passport.status<>'draft'
       or v_passport.public_payload<>p_public_payload
       or v_passport.private_payload<>p_private_payload then
      raise exception 'battery passport already exists with different state or payload'
        using errcode='DP605';
    end if;
  else
    insert into public.dpp_passports(
      organization_id,battery_item_id,status,public_payload,private_payload,created_by
    ) values (
      v_org,v_item.id,'draft',p_public_payload,p_private_payload,v_user
    )
    on conflict (organization_id,battery_item_id) do nothing
    returning * into v_passport;

    if found then
      v_created_passport:=true;
    else
      select p.* into v_passport
      from public.dpp_passports p
      where p.organization_id=v_org
        and p.battery_item_id=v_item.id
      for update;

      if not found
         or v_passport.status<>'draft'
         or v_passport.public_payload<>p_public_payload
         or v_passport.private_payload<>p_private_payload then
        raise exception 'battery passport already exists with different state or payload'
          using errcode='DP605';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'item_id',v_item.id,
    'passport_id',v_passport.id,
    'model_id',v_item.model_id,
    'unique_identifier',v_item.unique_identifier,
    'lifecycle_status',v_item.lifecycle_status,
    'passport_status',v_passport.status,
    'public_payload',v_passport.public_payload,
    'activation_required',true,
    'created_item',v_created_item,
    'created_passport',v_created_passport,
    'idempotent_replay',not (v_created_item or v_created_passport),
    'created_at',v_item.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_battery_batch_provision(
  p_model_id uuid,
  p_batch_key text,
  p_units jsonb
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
  v_batch public.dpp_provision_batches%rowtype;
  v_unit jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_quantity integer;
  v_position integer := 0;
  v_identifier text;
  v_fingerprint text;
  v_created_batch boolean := false;
  v_existing_link public.dpp_provision_batch_items%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_model_id is null then
    raise exception 'model_id is required' using errcode='DP603';
  end if;

  if p_batch_key is null
     or length(btrim(p_batch_key)) not between 1 and 128
     or btrim(p_batch_key) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'batch_key is invalid' using errcode='DP603';
  end if;

  if p_units is null or jsonb_typeof(p_units)<>'array' then
    raise exception 'units must be a JSON array' using errcode='DP603';
  end if;

  v_quantity:=jsonb_array_length(p_units);
  if v_quantity not between 1 and 250 then
    raise exception 'batch quantity must be between 1 and 250' using errcode='DP603';
  end if;

  select m.* into v_model
  from public.dpp_battery_models m
  where m.id=p_model_id and m.organization_id=v_org
  for share;

  if not found then
    raise exception 'battery model not found in active organization' using errcode='DP601';
  end if;

  v_fingerprint:=encode(extensions.digest(convert_to(p_units::text,'UTF8'),'sha256'),'hex');

  select b.* into v_batch
  from public.dpp_provision_batches b
  where b.organization_id=v_org and b.batch_key=btrim(p_batch_key)
  for update;

  if found then
    if v_batch.model_id<>p_model_id
       or v_batch.request_fingerprint<>v_fingerprint
       or v_batch.quantity<>v_quantity
       or v_batch.status<>'committed' then
      raise exception 'batch key already belongs to a different provisioning request'
        using errcode='DP606';
    end if;
  else
    insert into public.dpp_provision_batches(
      organization_id,model_id,batch_key,request_fingerprint,quantity,status,created_by
    ) values (
      v_org,p_model_id,btrim(p_batch_key),v_fingerprint,v_quantity,'committed',v_user
    )
    returning * into v_batch;
    v_created_batch:=true;
  end if;

  for v_unit in select value from jsonb_array_elements(p_units)
  loop
    v_position:=v_position+1;
    if jsonb_typeof(v_unit)<>'object' then
      raise exception 'every batch unit must be an object' using errcode='DP603';
    end if;

    v_identifier:=btrim(coalesce(v_unit->>'unique_identifier',''));
    if length(v_identifier) not between 1 and 300
       or v_identifier ~ '[[:cntrl:]]' then
      raise exception 'batch unit identifier is invalid' using errcode='DP603';
    end if;

    select public.dpp_api_battery_provision(
      p_model_id,
      v_identifier,
      coalesce(v_unit->'item_canonical_data','{}'::jsonb),
      coalesce(v_unit->'public_payload','{}'::jsonb),
      coalesce(v_unit->'private_payload','{}'::jsonb)
    ) into v_result;

    if v_created_batch then
      insert into public.dpp_provision_batch_items(
        batch_id,position,item_id,passport_id,unique_identifier
      ) values (
        v_batch.id,
        v_position,
        (v_result->>'item_id')::uuid,
        (v_result->>'passport_id')::uuid,
        v_result->>'unique_identifier'
      );
    else
      select x.* into v_existing_link
      from public.dpp_provision_batch_items x
      where x.batch_id=v_batch.id and x.position=v_position;

      if not found
         or v_existing_link.item_id<>(v_result->>'item_id')::uuid
         or v_existing_link.passport_id<>(v_result->>'passport_id')::uuid
         or v_existing_link.unique_identifier<>v_result->>'unique_identifier' then
        raise exception 'stored batch membership conflicts with provisioned item'
          using errcode='DP607';
      end if;
    end if;

    v_results:=v_results || jsonb_build_array(
      v_result || jsonb_build_object('position',v_position)
    );
  end loop;

  if not v_created_batch and (
    select count(*) from public.dpp_provision_batch_items x where x.batch_id=v_batch.id
  )<>v_quantity then
    raise exception 'stored batch membership count is inconsistent'
      using errcode='DP607';
  end if;

  return jsonb_build_object(
    'batch_id',v_batch.id,
    'batch_key',v_batch.batch_key,
    'model_id',v_batch.model_id,
    'quantity',v_quantity,
    'created_batch',v_created_batch,
    'idempotent_replay',not v_created_batch,
    'created_at',v_batch.created_at,
    'units',v_results
  );
end
$fn$;

revoke all on function public.dpp_api_battery_provision(uuid,text,jsonb,jsonb,jsonb)
from public,anon;
revoke all on function public.dpp_api_battery_batch_provision(uuid,text,jsonb)
from public,anon;

grant execute on function public.dpp_api_battery_provision(uuid,text,jsonb,jsonb,jsonb)
to authenticated;
grant execute on function public.dpp_api_battery_batch_provision(uuid,text,jsonb)
to authenticated;

comment on function public.dpp_api_battery_provision(uuid,text,jsonb,jsonb,jsonb) is
  'Manufacturer Pilot V1 generic atomic battery provisioning for any supported battery category; creates a tenant-scoped physical item and DRAFT passport with idempotent retries.';
comment on function public.dpp_api_battery_batch_provision(uuid,text,jsonb) is
  'Manufacturer Pilot V1 generic atomic 1..250 battery batch provisioning for any supported battery category; creates individual items/passports and durable batch membership.';
