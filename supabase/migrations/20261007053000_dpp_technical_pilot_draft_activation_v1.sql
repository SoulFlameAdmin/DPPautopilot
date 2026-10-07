-- Manufacturer Pilot V1: allow an existing non-LMT DRAFT passport to become
-- an explicitly marked technical pilot without changing its passport identity.
-- LMT batteries remain locked behind the regulatory readiness activation route.
-- UPDATE is intentional: existing passport audit/version triggers preserve history.

create or replace function public.dpp_api_technical_pilot_publish(
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
  v_item public.dpp_battery_items%rowtype;
  v_model public.dpp_battery_models%rowtype;
  v_passport public.dpp_passports%rowtype;
  v_public jsonb;
  v_now timestamptz := now();
  v_created boolean := false;
  v_activated_from_draft boolean := false;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_battery_item_id is null then
    raise exception 'battery_item_id is required' using errcode='DP404';
  end if;
  if p_public_payload is null or jsonb_typeof(p_public_payload)<>'object' then
    raise exception 'public_payload must be a JSON object' using errcode='DP406';
  end if;
  if p_private_payload is null or jsonb_typeof(p_private_payload)<>'object' then
    raise exception 'private_payload must be a JSON object' using errcode='DP407';
  end if;

  select i.* into v_item
  from public.dpp_battery_items i
  where i.id=p_battery_item_id and i.organization_id=v_org
  for share;

  if not found then
    raise exception 'battery item not found in active organization' using errcode='DP405';
  end if;

  select m.* into v_model
  from public.dpp_battery_models m
  where m.id=v_item.model_id and m.organization_id=v_org
  for share;

  if not found then
    raise exception 'battery model not found in active organization' using errcode='DP601';
  end if;

  if v_model.category='light_means_of_transport' then
    raise exception 'LMT passports require the regulatory readiness activation route'
      using errcode='DP602';
  end if;

  if p_public_payload#>>'{item,unique_identifier}' is null
     or p_public_payload#>>'{item,unique_identifier}'<>v_item.unique_identifier then
    raise exception 'public item.unique_identifier must match the battery item'
      using errcode='DP603';
  end if;

  if p_public_payload#>>'{model,identification,category}' is not null
     and p_public_payload#>>'{model,identification,category}'<>v_model.category then
    raise exception 'public model category must match the stored battery model'
      using errcode='DP603';
  end if;

  if p_public_payload#>>'{model,identification,model_id}' is not null
     and p_public_payload#>>'{model,identification,model_id}'<>v_model.model_identifier then
    raise exception 'public model id must match the stored battery model'
      using errcode='DP603';
  end if;

  if p_public_payload#>>'{model,identification,manufacturer,name}' is not null
     and p_public_payload#>>'{model,identification,manufacturer,name}'<>v_model.manufacturer_name then
    raise exception 'public manufacturer must match the stored battery model'
      using errcode='DP603';
  end if;

  perform public.dpp_assert_public_passport_payload_safe(
    p_public_payload,
    v_item.unique_identifier
  );

  v_public:=p_public_payload || jsonb_build_object(
    'pilot',
    jsonb_build_object(
      'mode','technical_pilot',
      'regulatory_compliance',false,
      'scope','customer_data_validation',
      'published_at',v_now
    )
  );

  -- p_public_payload was validated above. The pilot object below is fixed,
  -- server-owned publication metadata; callers cannot inject or override it because
  -- the public payload classifier rejects unknown root keys before this merge.
  select p.* into v_passport
  from public.dpp_passports p
  where p.organization_id=v_org
    and p.battery_item_id=v_item.id
  for update;

  if found and v_passport.status='active'
     and v_passport.public_payload#>>'{pilot,mode}'='technical_pilot' then
    if (v_passport.public_payload - 'pilot')<>p_public_payload
       or v_passport.private_payload<>p_private_payload then
      raise exception 'technical pilot passport already exists with different payload'
        using errcode='DP605';
    end if;

    return jsonb_build_object(
      'passport_id',v_passport.id,
      'battery_item_id',v_passport.battery_item_id,
      'model_id',v_model.id,
      'unique_identifier',v_item.unique_identifier,
      'status',v_passport.status,
      'public_payload',v_passport.public_payload,
      'private_payload',v_passport.private_payload,
      'technical_pilot',true,
      'regulatory_compliance',false,
      'created',false,
      'activated_from_draft',false,
      'idempotent_replay',true,
      'created_at',v_passport.created_at,
      'updated_at',v_passport.updated_at
    );
  end if;

  if found and v_passport.status='draft' then
    if v_passport.public_payload<>p_public_payload
       or v_passport.private_payload<>p_private_payload then
      raise exception 'draft passport payload differs from technical pilot publish request'
        using errcode='DP605';
    end if;

    update public.dpp_passports
    set status='active',
        public_payload=v_public,
        private_payload=p_private_payload,
        updated_at=v_now
    where id=v_passport.id
      and organization_id=v_org
      and status='draft'
    returning * into v_passport;

    if not found then
      raise exception 'draft passport changed during technical pilot activation'
        using errcode='DP605';
    end if;
    v_activated_from_draft:=true;

    return jsonb_build_object(
      'passport_id',v_passport.id,
      'battery_item_id',v_passport.battery_item_id,
      'model_id',v_model.id,
      'unique_identifier',v_item.unique_identifier,
      'status',v_passport.status,
      'public_payload',v_passport.public_payload,
      'private_payload',v_passport.private_payload,
      'technical_pilot',true,
      'regulatory_compliance',false,
      'created',false,
      'activated_from_draft',v_activated_from_draft,
      'idempotent_replay',false,
      'created_at',v_passport.created_at,
      'updated_at',v_passport.updated_at
    );
  end if;

  if found then
    raise exception 'battery passport already exists outside this technical pilot state'
      using errcode='DP605';
  end if;

  insert into public.dpp_passports(
    organization_id,battery_item_id,status,public_payload,private_payload,created_by
  ) values (
    v_org,v_item.id,'active',v_public,p_private_payload,v_user
  )
  returning * into v_passport;
  v_created:=true;

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'battery_item_id',v_passport.battery_item_id,
    'model_id',v_model.id,
    'unique_identifier',v_item.unique_identifier,
    'status',v_passport.status,
    'public_payload',v_passport.public_payload,
    'private_payload',v_passport.private_payload,
    'technical_pilot',true,
    'regulatory_compliance',false,
    'created',v_created,
    'activated_from_draft',false,
    'idempotent_replay',false,
    'created_at',v_passport.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;

revoke all on function public.dpp_api_technical_pilot_publish(uuid,jsonb,jsonb)
from public,anon;
grant execute on function public.dpp_api_technical_pilot_publish(uuid,jsonb,jsonb)
to authenticated;

comment on function public.dpp_api_technical_pilot_publish(uuid,jsonb,jsonb) is
  'Publishes a non-LMT technical pilot, including safe DRAFT-to-ACTIVE promotion while preserving passport identity and trigger-backed audit/version history. LMT remains readiness-gated.';
