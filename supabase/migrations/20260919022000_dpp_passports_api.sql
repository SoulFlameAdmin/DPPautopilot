-- M19 partial precursor: public/private passport read and controlled write RPCs.
-- Public surface is intentionally one narrow anon RPC returning only active public_payload.
-- M19 remains RED until M03/M10 are fully accepted and deployed end-to-end security acceptance is possible.

create or replace function public.dpp_api_passport_public(p_unique_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_result jsonb;
begin
  if p_unique_identifier is null or length(btrim(p_unique_identifier)) not between 1 and 300 then
    raise exception 'unique_identifier must contain 1..300 characters' using errcode='DP401';
  end if;

  select jsonb_build_object(
    'passport_id',p.id,
    'battery_item_id',i.id,
    'unique_identifier',i.unique_identifier,
    'status',p.status,
    'public_payload',p.public_payload,
    'updated_at',p.updated_at
  )
  into v_result
  from public.dpp_passports p
  join public.dpp_battery_items i
    on i.id=p.battery_item_id
   and i.organization_id=p.organization_id
  where i.unique_identifier=btrim(p_unique_identifier)
    and p.status='active';

  if v_result is null then
    raise exception 'active public passport not found' using errcode='DP402';
  end if;

  return v_result;
end
$fn$;

create or replace function public.dpp_api_passport_private(p_id uuid)
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

  if p_id is null then
    raise exception 'passport id is required' using errcode='DP403';
  end if;

  select jsonb_build_object(
    'passport_id',p.id,
    'battery_item_id',p.battery_item_id,
    'status',p.status,
    'public_payload',p.public_payload,
    'private_payload',p.private_payload,
    'created_at',p.created_at,
    'updated_at',p.updated_at
  )
  into v_result
  from public.dpp_passports p
  where p.id=p_id
    and p.organization_id=v_org;

  if v_result is null then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;

  return v_result;
end
$fn$;

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
  v_passport public.dpp_passports%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_battery_item_id is null then
    raise exception 'battery_item_id is required' using errcode='DP404';
  end if;
  if not exists (
    select 1 from public.dpp_battery_items i
    where i.id=p_battery_item_id and i.organization_id=v_org
  ) then
    raise exception 'battery item not found in active organization' using errcode='DP405';
  end if;
  if p_public_payload is null or jsonb_typeof(p_public_payload)<>'object' then
    raise exception 'public_payload must be a JSON object' using errcode='DP406';
  end if;
  if p_private_payload is null or jsonb_typeof(p_private_payload)<>'object' then
    raise exception 'private_payload must be a JSON object' using errcode='DP407';
  end if;

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

  update public.dpp_passports p
  set status=coalesce(p_status,p.status),
      public_payload=coalesce(p_public_payload,p.public_payload),
      private_payload=coalesce(p_private_payload,p.private_payload),
      updated_at=now()
  where p.id=p_id and p.organization_id=v_org
  returning * into v_passport;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;

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

revoke all on function public.dpp_api_passport_public(text) from public,authenticated;
revoke all on function public.dpp_api_passport_private(uuid) from public,anon;
revoke all on function public.dpp_api_passport_create(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.dpp_api_passport_update(uuid,text,jsonb,jsonb) from public,anon;

grant execute on function public.dpp_api_passport_public(text) to anon,authenticated;
grant execute on function public.dpp_api_passport_private(uuid) to authenticated;
grant execute on function public.dpp_api_passport_create(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.dpp_api_passport_update(uuid,text,jsonb,jsonb) to authenticated;

comment on function public.dpp_api_passport_public(text) is
  'M19 precursor: anonymous/public active passport read returning public payload only.';
comment on function public.dpp_api_passport_private(uuid) is
  'M19 precursor: active-tenant authenticated passport read including private payload.';
comment on function public.dpp_api_passport_create(uuid,jsonb,jsonb) is
  'M19 precursor: create draft passport for an item in the explicit active tenant.';
comment on function public.dpp_api_passport_update(uuid,text,jsonb,jsonb) is
  'M19 precursor: controlled passport update in the explicit active tenant.';
