-- Physical QR/NFC carrier binding for the real DPP provisioning test.
-- This is intentionally separate from cryptographic Secure NFC identities.
-- NTAG215 is treated as a convenient URL carrier, never as an authentication factor.

create table public.dpp_physical_carriers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  battery_item_id uuid not null,
  carrier_kind text not null check (carrier_kind in ('qr','nfc')),
  nfc_technology text null check (
    nfc_technology is null or nfc_technology in ('ntag213','ntag215','ntag216','ntag424_dna','other')
  ),
  public_url text not null check (length(btrim(public_url)) between 1 and 2048),
  external_uid text null check (external_uid is null or length(btrim(external_uid)) between 1 and 256),
  status text not null default 'active' check (status in ('active','revoked','replaced')),
  bound_by uuid null references auth.users(id) on delete set null,
  bound_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_reason text null check (revoked_reason is null or length(btrim(revoked_reason)) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint dpp_physical_carrier_battery_fk
    foreign key (organization_id,battery_item_id)
    references public.dpp_battery_items(organization_id,id)
    on delete restrict,
  constraint dpp_physical_carrier_kind_check
    check (
      (carrier_kind='qr' and nfc_technology is null)
      or
      (carrier_kind='nfc' and nfc_technology is not null)
    ),
  constraint dpp_physical_carrier_revocation_check
    check (
      (status='active' and revoked_at is null)
      or
      (status in ('revoked','replaced') and revoked_at is not null)
    )
);

create unique index dpp_one_active_physical_carrier_per_kind
  on public.dpp_physical_carriers(organization_id,battery_item_id,carrier_kind)
  where status='active';

create table public.dpp_carrier_scan_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  battery_item_id uuid not null,
  carrier_id uuid null,
  actor_id uuid null,
  source text not null default 'unknown' check (source in ('qr','nfc','unknown')),
  result text not null check (result in ('opened','revoked')),
  occurred_at timestamptz not null default now(),
  constraint dpp_carrier_scan_battery_fk
    foreign key (organization_id,battery_item_id)
    references public.dpp_battery_items(organization_id,id)
    on delete restrict,
  constraint dpp_carrier_scan_carrier_fk
    foreign key (organization_id,carrier_id)
    references public.dpp_physical_carriers(organization_id,id)
    on delete set null
);

create index dpp_carrier_scan_org_time_idx
  on public.dpp_carrier_scan_events(organization_id,occurred_at desc);

alter table public.dpp_physical_carriers enable row level security;
alter table public.dpp_carrier_scan_events enable row level security;
revoke all on table public.dpp_physical_carriers from anon,authenticated;
revoke all on table public.dpp_carrier_scan_events from anon,authenticated;

create policy dpp_physical_carriers_member_select
on public.dpp_physical_carriers for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));

create policy dpp_carrier_scan_admin_select
on public.dpp_carrier_scan_events for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create trigger dpp_audit_physical_carriers
after insert or update or delete on public.dpp_physical_carriers
for each row execute function public.dpp_capture_audit_event();

create or replace function public.dpp_api_carriers_list(
  p_battery_item_id uuid default null
)
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

  if p_battery_item_id is not null and not exists (
    select 1 from public.dpp_battery_items i
    where i.id=p_battery_item_id and i.organization_id=v_org
  ) then
    raise exception 'battery item not found in active organization' using errcode='DP706';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',c.id,
      'battery_item_id',c.battery_item_id,
      'carrier_kind',c.carrier_kind,
      'nfc_technology',c.nfc_technology,
      'public_url',c.public_url,
      'external_uid',c.external_uid,
      'status',c.status,
      'bound_at',c.bound_at,
      'revoked_at',c.revoked_at
    )
    order by c.bound_at desc,c.id
  ),'[]'::jsonb)
  into v_result
  from public.dpp_physical_carriers c
  where c.organization_id=v_org
    and (p_battery_item_id is null or c.battery_item_id=p_battery_item_id);

  return v_result;
end
$fn$;

create or replace function public.dpp_api_carrier_bind(
  p_battery_item_id uuid,
  p_carrier_kind text,
  p_public_url text,
  p_nfc_technology text default null,
  p_external_uid text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_carrier public.dpp_physical_carriers%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_battery_item_id is null or not exists (
    select 1 from public.dpp_battery_items i
    where i.id=p_battery_item_id and i.organization_id=v_org
  ) then
    raise exception 'battery item not found in active organization' using errcode='DP706';
  end if;

  if p_carrier_kind not in ('qr','nfc') then
    raise exception 'unsupported carrier kind' using errcode='DP701';
  end if;

  if p_carrier_kind='nfc' and coalesce(p_nfc_technology,'') not in
    ('ntag213','ntag215','ntag216','ntag424_dna','other') then
    raise exception 'nfc technology is required' using errcode='DP702';
  end if;
  if p_carrier_kind='qr' and p_nfc_technology is not null then
    raise exception 'qr carrier cannot have nfc technology' using errcode='DP702';
  end if;

  if p_public_url is null
     or length(btrim(p_public_url)) not between 1 and 2048
     or not (
       btrim(p_public_url) ~ '^https://'
       or btrim(p_public_url) ~ '^http://localhost([:/]|$)'
       or btrim(p_public_url) ~ '^http://127[.]0[.]0[.]1([:/]|$)'
     ) then
    raise exception 'public_url must be https or local test http' using errcode='DP703';
  end if;

  if p_external_uid is not null and length(btrim(p_external_uid)) not between 1 and 256 then
    raise exception 'external_uid length is invalid' using errcode='DP704';
  end if;

  update public.dpp_physical_carriers c
  set status='replaced',
      revoked_at=now(),
      revoked_reason='replaced by new active carrier'
  where c.organization_id=v_org
    and c.battery_item_id=p_battery_item_id
    and c.carrier_kind=p_carrier_kind
    and c.status='active';

  insert into public.dpp_physical_carriers(
    organization_id,battery_item_id,carrier_kind,nfc_technology,
    public_url,external_uid,status,bound_by
  ) values (
    v_org,p_battery_item_id,p_carrier_kind,
    case when p_carrier_kind='nfc' then p_nfc_technology else null end,
    btrim(p_public_url),nullif(btrim(coalesce(p_external_uid,'')),''),
    'active',v_user
  )
  returning * into v_carrier;

  return jsonb_build_object(
    'id',v_carrier.id,
    'battery_item_id',v_carrier.battery_item_id,
    'carrier_kind',v_carrier.carrier_kind,
    'nfc_technology',v_carrier.nfc_technology,
    'public_url',v_carrier.public_url,
    'external_uid',v_carrier.external_uid,
    'status',v_carrier.status,
    'bound_at',v_carrier.bound_at,
    'revoked_at',v_carrier.revoked_at
  );
end
$fn$;

create or replace function public.dpp_api_carrier_revoke(
  p_id uuid,
  p_reason text default 'manual revoke'
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_carrier public.dpp_physical_carriers%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);

  update public.dpp_physical_carriers c
  set status='revoked',
      revoked_at=now(),
      revoked_reason=coalesce(nullif(btrim(p_reason),''),'manual revoke')
  where c.id=p_id
    and c.organization_id=v_org
    and c.status='active'
  returning * into v_carrier;

  if not found then
    raise exception 'active carrier not found in active organization' using errcode='DP705';
  end if;

  return jsonb_build_object(
    'id',v_carrier.id,
    'battery_item_id',v_carrier.battery_item_id,
    'carrier_kind',v_carrier.carrier_kind,
    'status',v_carrier.status,
    'revoked_at',v_carrier.revoked_at
  );
end
$fn$;

create or replace function public.dpp_api_carrier_open(
  p_unique_identifier text,
  p_source text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_source text;
  v_org uuid;
  v_item uuid;
  v_carrier uuid;
  v_passport uuid;
  v_status text;
  v_payload jsonb;
  v_updated timestamptz;
  v_actor uuid;
begin
  if p_unique_identifier is null or length(btrim(p_unique_identifier)) not between 1 and 300 then
    raise exception 'unique_identifier must contain 1..300 characters' using errcode='DP401';
  end if;

  v_source:=coalesce(p_source,'unknown');
  if v_source not in ('qr','nfc','unknown') then
    raise exception 'unsupported carrier source' using errcode='DP701';
  end if;

  select i.organization_id,i.id,p.id,p.status,p.public_payload,p.updated_at
  into v_org,v_item,v_passport,v_status,v_payload,v_updated
  from public.dpp_battery_items i
  join public.dpp_passports p
    on p.organization_id=i.organization_id
   and p.battery_item_id=i.id
  where i.unique_identifier=btrim(p_unique_identifier)
    and p.status='active';

  if not found then
    raise exception 'active public passport not found' using errcode='DP402';
  end if;

  select c.id
  into v_carrier
  from public.dpp_physical_carriers c
  where c.organization_id=v_org
    and c.battery_item_id=v_item
    and c.status='active'
    and (v_source='unknown' or c.carrier_kind=v_source)
  order by case when c.carrier_kind=v_source then 0 else 1 end,c.bound_at desc
  limit 1;

  if v_carrier is null then
    raise exception 'active physical carrier not found' using errcode='DP705';
  end if;

  v_actor:=public.dpp_request_user_id();

  insert into public.dpp_carrier_scan_events(
    organization_id,battery_item_id,carrier_id,actor_id,source,result
  ) values (
    v_org,v_item,v_carrier,v_actor,v_source,'opened'
  );

  return jsonb_build_object(
    'passport_id',v_passport,
    'unique_identifier',btrim(p_unique_identifier),
    'status',v_status,
    'public_payload',v_payload,
    'updated_at',v_updated
  );
end
$fn$;

revoke all on function public.dpp_api_carriers_list(uuid) from public,anon;
revoke all on function public.dpp_api_carrier_bind(uuid,text,text,text,text) from public,anon;
revoke all on function public.dpp_api_carrier_revoke(uuid,text) from public,anon;
revoke all on function public.dpp_api_carrier_open(text,text) from public;

grant execute on function public.dpp_api_carriers_list(uuid) to authenticated;
grant execute on function public.dpp_api_carrier_bind(uuid,text,text,text,text) to authenticated;
grant execute on function public.dpp_api_carrier_revoke(uuid,text) to authenticated;
grant execute on function public.dpp_api_carrier_open(text,text) to anon,authenticated;

comment on table public.dpp_physical_carriers is
  'Physical QR/NFC URL carriers. NTAG215 is convenience transport only; authentication remains in the DPP backend.';
comment on table public.dpp_carrier_scan_events is
  'Append-only physical carrier open events without device fingerprinting or secret material.';
