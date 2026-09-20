-- M19/M23 hardening: deterministic idempotent passport creation.
-- The tenant-scoped battery item is the natural idempotency key because core schema
-- permits only one passport per (organization_id,battery_item_id).

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

  select p.*
  into v_passport
  from public.dpp_passports p
  where p.organization_id=v_org
    and p.battery_item_id=p_battery_item_id
  for update;

  if found then
    if v_passport.status='draft'
       and v_passport.public_payload=p_public_payload
       and v_passport.private_payload=p_private_payload then
      return jsonb_build_object(
        'passport_id',v_passport.id,
        'battery_item_id',v_passport.battery_item_id,
        'status',v_passport.status,
        'public_payload',v_passport.public_payload,
        'private_payload',v_passport.private_payload,
        'created_at',v_passport.created_at,
        'updated_at',v_passport.updated_at
      );
    end if;

    raise exception 'passport already exists with different state or payload'
      using errcode='DP412';
  end if;

  begin
    insert into public.dpp_passports(
      organization_id,battery_item_id,status,public_payload,private_payload,created_by
    ) values (
      v_org,p_battery_item_id,'draft',p_public_payload,p_private_payload,v_user
    )
    returning * into v_passport;
  exception when unique_violation then
    select p.*
    into v_passport
    from public.dpp_passports p
    where p.organization_id=v_org
      and p.battery_item_id=p_battery_item_id
    for update;

    if found
       and v_passport.status='draft'
       and v_passport.public_payload=p_public_payload
       and v_passport.private_payload=p_private_payload then
      null;
    else
      raise exception 'passport already exists with different state or payload'
        using errcode='DP412';
    end if;
  end;

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

revoke all on function public.dpp_api_passport_create(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.dpp_api_passport_create(uuid,jsonb,jsonb) to authenticated;

comment on function public.dpp_api_passport_create(uuid,jsonb,jsonb) is
  'M19/M23 idempotent draft passport create keyed by tenant battery item; identical retries return the existing draft, divergent retries raise DP412.';
