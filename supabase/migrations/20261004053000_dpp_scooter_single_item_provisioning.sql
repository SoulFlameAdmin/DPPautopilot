-- Stage 4: atomic single-item provisioning for the Scooter Battery / LMT profile.
-- One authenticated write creates/reuses the individual battery item and its ACTIVE passport.
-- The function is idempotent for an identical retry and fail-closed for divergent retries.

create or replace function public.dpp_api_scooter_battery_provision(
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

  if p_item_canonical_data is null or jsonb_typeof(p_item_canonical_data)<>'object' then
    raise exception 'item_canonical_data must be a JSON object'
      using errcode='DP603';
  end if;
  if p_public_payload is null or jsonb_typeof(p_public_payload)<>'object' then
    raise exception 'public_payload must be a JSON object'
      using errcode='DP603';
  end if;
  if p_private_payload is null or jsonb_typeof(p_private_payload)<>'object' then
    raise exception 'private_payload must be a JSON object'
      using errcode='DP603';
  end if;

  select m.*
  into v_model
  from public.dpp_battery_models m
  where m.id=p_model_id
    and m.organization_id=v_org
  for share;

  if not found then
    raise exception 'battery model not found in active organization'
      using errcode='DP601';
  end if;
  if v_model.category<>'light_means_of_transport' then
    raise exception 'battery model is not an LMT model'
      using errcode='DP602';
  end if;

  if p_public_payload#>>'{item,unique_identifier}' is null
     or p_public_payload#>>'{item,unique_identifier}'<>v_identifier then
    raise exception 'public item.unique_identifier must match provisioned battery identifier'
      using errcode='DP603';
  end if;

  if p_public_payload#>>'{model,identification,category}' is not null
     and p_public_payload#>>'{model,identification,category}'<>'light_means_of_transport' then
    raise exception 'public model category must be light_means_of_transport'
      using errcode='DP603';
  end if;

  perform public.dpp_assert_public_passport_payload_safe(p_public_payload,v_identifier);

  -- Lock/reuse an existing identifier if it is exactly the same logical item.
  select i.*
  into v_item
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
      -- A concurrent identical request may have won the unique identifier race.
      select i.*
      into v_item
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

  select p.*
  into v_passport
  from public.dpp_passports p
  where p.organization_id=v_org
    and p.battery_item_id=v_item.id
  for update;

  if found then
    if v_passport.status<>'active'
       or v_passport.public_payload<>p_public_payload
       or v_passport.private_payload<>p_private_payload then
      raise exception 'battery passport already exists with different state or payload'
        using errcode='DP605';
    end if;
  else
    insert into public.dpp_passports(
      organization_id,battery_item_id,status,public_payload,private_payload,created_by
    ) values (
      v_org,v_item.id,'active',p_public_payload,p_private_payload,v_user
    )
    on conflict (organization_id,battery_item_id) do nothing
    returning * into v_passport;

    if found then
      v_created_passport:=true;
    else
      -- A concurrent identical request may have won the per-item passport race.
      select p.*
      into v_passport
      from public.dpp_passports p
      where p.organization_id=v_org
        and p.battery_item_id=v_item.id
      for update;

      if not found
         or v_passport.status<>'active'
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
    'created_item',v_created_item,
    'created_passport',v_created_passport,
    'idempotent_replay',not (v_created_item or v_created_passport),
    'created_at',v_item.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;

revoke all on function public.dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb)
from public,anon;
grant execute on function public.dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb)
to authenticated;

comment on function public.dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb) is
  'Stage 4 atomic LMT provisioning: validate model -> individual battery item -> unique identifier -> ACTIVE passport; identical retries are idempotent and divergent retries fail closed.';
