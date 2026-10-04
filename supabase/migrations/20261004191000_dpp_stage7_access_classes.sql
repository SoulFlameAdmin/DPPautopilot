-- Stage 7: enforced public / legitimate-interest / authority-only access paths.

create table if not exists public.dpp_authority_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  authority_name text not null check (length(btrim(authority_name)) between 1 and 200),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.dpp_authority_users enable row level security;
revoke all on table public.dpp_authority_users from anon,authenticated;

create table if not exists public.dpp_passport_authority_payloads (
  passport_id uuid primary key references public.dpp_passports(id) on delete cascade,
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  authority_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(authority_payload)='object'),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id,passport_id)
);

alter table public.dpp_passport_authority_payloads enable row level security;
revoke all on table public.dpp_passport_authority_payloads from anon,authenticated;

create or replace function public.dpp_authority_payload_is_valid(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path=public,pg_temp
as $fn$
declare
  v_key text;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    return false;
  end if;

  for v_key in select jsonb_object_keys(p_payload)
  loop
    if v_key<>'model' then return false; end if;
  end loop;

  if p_payload ? 'model' then
    if jsonb_typeof(p_payload->'model')<>'object' then return false; end if;
    for v_key in select jsonb_object_keys(p_payload->'model')
    loop
      if v_key<>'compliance_test_reports' then return false; end if;
    end loop;
    if (p_payload->'model') ? 'compliance_test_reports'
       and jsonb_typeof(p_payload#>'{model,compliance_test_reports}')<>'array' then
      return false;
    end if;
  end if;

  return true;
end
$fn$;

create or replace function public.dpp_api_authority_payload_set(
  p_passport_id uuid,
  p_authority_payload jsonb
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

  if not public.dpp_authority_payload_is_valid(p_authority_payload) then
    raise exception 'authority payload contains unsupported fields'
      using errcode='DP701';
  end if;

  select * into v_passport
  from public.dpp_passports p
  where p.id=p_passport_id and p.organization_id=v_org;

  if not found then
    raise exception 'passport not found in active organization'
      using errcode='DP401';
  end if;

  insert into public.dpp_passport_authority_payloads(
    passport_id,organization_id,authority_payload,updated_by,updated_at
  ) values (
    v_passport.id,v_org,p_authority_payload,v_user,now()
  )
  on conflict(passport_id) do update
  set authority_payload=excluded.authority_payload,
      updated_by=excluded.updated_by,
      updated_at=now();

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'organization_id',v_org,
    'authority_payload',p_authority_payload,
    'updated_at',(select updated_at from public.dpp_passport_authority_payloads where passport_id=v_passport.id)
  );
end
$fn$;

create or replace function public.dpp_api_passport_legitimate_interest(
  p_unique_identifier text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_passport public.dpp_passports%rowtype;
  v_item public.dpp_battery_items%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select p.*,i.*
  into v_passport,v_item
  from public.dpp_passports p
  join public.dpp_battery_items i on i.id=p.battery_item_id and i.organization_id=p.organization_id
  where p.organization_id=v_org
    and i.unique_identifier=p_unique_identifier
    and p.status='active'
  limit 1;

  if not found then
    raise exception 'passport not found in active organization'
      using errcode='DP401';
  end if;

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'battery_item_id',v_passport.battery_item_id,
    'unique_identifier',v_item.unique_identifier,
    'status',v_passport.status,
    'public_payload',v_passport.public_payload,
    'private_payload',v_passport.private_payload,
    'created_at',v_passport.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_passport_authority(
  p_unique_identifier text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_user uuid;
  v_passport public.dpp_passports%rowtype;
  v_item public.dpp_battery_items%rowtype;
  v_authority jsonb;
begin
  v_user:=public.dpp_request_user_id();
  if v_user is null or not exists (
    select 1 from public.dpp_authority_users a
    where a.user_id=v_user and a.enabled
  ) then
    raise exception 'authority credential is required'
      using errcode='DP702';
  end if;

  select p.*,i.*
  into v_passport,v_item
  from public.dpp_passports p
  join public.dpp_battery_items i on i.id=p.battery_item_id and i.organization_id=p.organization_id
  where i.unique_identifier=p_unique_identifier
    and p.status='active'
  limit 1;

  if not found then
    raise exception 'passport not found'
      using errcode='DP401';
  end if;

  select coalesce(a.authority_payload,'{}'::jsonb)
  into v_authority
  from public.dpp_passport_authority_payloads a
  where a.passport_id=v_passport.id;
  v_authority:=coalesce(v_authority,'{}'::jsonb);

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'battery_item_id',v_passport.battery_item_id,
    'unique_identifier',v_item.unique_identifier,
    'status',v_passport.status,
    'public_payload',v_passport.public_payload,
    'private_payload',v_passport.private_payload,
    'authority_payload',v_authority,
    'created_at',v_passport.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;

revoke all on function public.dpp_authority_payload_is_valid(jsonb) from public,anon,authenticated;
revoke all on function public.dpp_api_authority_payload_set(uuid,jsonb) from public,anon;
revoke all on function public.dpp_api_passport_legitimate_interest(text) from public,anon;
revoke all on function public.dpp_api_passport_authority(text) from public,anon;

grant execute on function public.dpp_api_authority_payload_set(uuid,jsonb) to authenticated;
grant execute on function public.dpp_api_passport_legitimate_interest(text) to authenticated;
grant execute on function public.dpp_api_passport_authority(text) to authenticated;

comment on table public.dpp_authority_users is
  'Stage 7 explicit allowlist for authenticated authority-only Battery Passport access; population is an operator-controlled trust action.';
comment on table public.dpp_passport_authority_payloads is
  'Stage 7 separate storage for authority-only fields; never projected through public or legitimate-interest reads.';
