-- Reconstruct the production passport lifecycle/public resolver substrate for clean replay.

create table if not exists public.dpp_passport_lifecycle (
  passport_id uuid primary key references public.dpp_passports(id) on delete cascade,
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  disposition text not null check (disposition in ('retired','revoked','replaced')),
  reason_code text not null check (
    reason_code in (
      'end_of_life','operator_revoked','safety_or_compliance',
      'incorrect_record','product_replaced','other'
    )
  ),
  reason_note text check (
    reason_note is null or length(btrim(reason_note)) between 1 and 500
  ),
  replacement_item_id uuid,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint dpp_passport_lifecycle_org_item_fk
    foreign key (organization_id,replacement_item_id)
    references public.dpp_battery_items(organization_id,id)
    on delete restrict,
  constraint dpp_passport_lifecycle_replacement_shape
    check (
      (disposition='replaced' and replacement_item_id is not null)
      or
      (disposition in ('retired','revoked') and replacement_item_id is null)
    )
);

create index if not exists dpp_passport_lifecycle_org_idx
  on public.dpp_passport_lifecycle(organization_id,disposition,changed_at desc);

alter table public.dpp_passport_lifecycle enable row level security;
revoke all on table public.dpp_passport_lifecycle from public,anon,authenticated;

do $grant$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant all on table public.dpp_passport_lifecycle to service_role';
  end if;
end
$grant$;

create or replace function public.dpp_api_passport_public_resolve(
  p_unique_identifier text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_identifier text;
  v_passport public.dpp_passports%rowtype;
  v_item public.dpp_battery_items%rowtype;
  v_lifecycle public.dpp_passport_lifecycle%rowtype;
  v_replacement_identifier text;
begin
  v_identifier:=btrim(coalesce(p_unique_identifier,''));
  if length(v_identifier) not between 1 and 300 or v_identifier ~ '[[:cntrl:]]' then
    raise exception 'unique_identifier must contain 1..300 printable characters' using errcode='DP401';
  end if;

  select p.* into v_passport
  from public.dpp_passports p
  join public.dpp_battery_items i
    on i.id=p.battery_item_id
   and i.organization_id=p.organization_id
  where i.unique_identifier=v_identifier;

  if not found then
    raise exception 'public passport not found' using errcode='DP402';
  end if;

  select i.* into v_item
  from public.dpp_battery_items i
  where i.id=v_passport.battery_item_id
    and i.organization_id=v_passport.organization_id;

  if v_passport.status='active' then
    return jsonb_build_object(
      'kind','active',
      'passport_id',v_passport.id,
      'battery_item_id',v_item.id,
      'unique_identifier',v_item.unique_identifier,
      'status','active',
      'public_payload',v_passport.public_payload,
      'updated_at',v_passport.updated_at
    );
  end if;

  if v_passport.status not in ('retired','revoked','replaced') then
    raise exception 'public passport not found' using errcode='DP402';
  end if;

  select l.* into v_lifecycle
  from public.dpp_passport_lifecycle l
  where l.passport_id=v_passport.id;

  if not found or v_lifecycle.disposition<>v_passport.status then
    raise exception 'terminal passport lifecycle metadata unavailable' using errcode='DP613';
  end if;

  if v_lifecycle.disposition='replaced' then
    select i.unique_identifier
      into v_replacement_identifier
    from public.dpp_battery_items i
    join public.dpp_passports p
      on p.battery_item_id=i.id
     and p.organization_id=i.organization_id
    where i.id=v_lifecycle.replacement_item_id
      and i.organization_id=v_lifecycle.organization_id
      and p.status='active';

    if v_replacement_identifier is null then
      raise exception 'replacement passport is not active' using errcode='DP614';
    end if;
  end if;

  return jsonb_build_object(
    'kind','lifecycle',
    'passport_id',v_passport.id,
    'unique_identifier',v_item.unique_identifier,
    'status',v_passport.status,
    'reason_code',v_lifecycle.reason_code,
    'replacement_identifier',v_replacement_identifier,
    'updated_at',v_passport.updated_at,
    'changed_at',v_lifecycle.changed_at
  );
end
$function$;

revoke all on function public.dpp_api_passport_public_resolve(text) from public;
grant execute on function public.dpp_api_passport_public_resolve(text) to anon, authenticated;

do $grant$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.dpp_api_passport_public_resolve(text) to service_role';
  end if;
end
$grant$;

create or replace function public.dpp_api_scooter_passport_transition(
  p_passport_id uuid,
  p_transition text,
  p_reason_code text,
  p_reason_note text default null,
  p_replacement_identifier text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_org uuid;
  v_user uuid;
  v_passport public.dpp_passports%rowtype;
  v_replacement_item public.dpp_battery_items%rowtype;
  v_replacement_passport public.dpp_passports%rowtype;
  v_reason_note text;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_transition not in ('retired','revoked','replaced') then
    raise exception 'unsupported terminal passport transition' using errcode='DP404';
  end if;
  if p_reason_code not in (
    'end_of_life','operator_revoked','safety_or_compliance',
    'incorrect_record','product_replaced','other'
  ) then
    raise exception 'unsupported lifecycle reason code' using errcode='DP404';
  end if;

  v_reason_note:=nullif(btrim(coalesce(p_reason_note,'')),'');
  if v_reason_note is not null and length(v_reason_note)>500 then
    raise exception 'reason note is too long' using errcode='DP404';
  end if;

  select p.* into v_passport
  from public.dpp_passports p
  where p.id=p_passport_id and p.organization_id=v_org
  for update;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;
  if p_expected_updated_at is null or v_passport.updated_at is distinct from p_expected_updated_at then
    raise exception 'passport changed since it was read' using errcode='DP411';
  end if;
  if v_passport.status<>'active' then
    raise exception 'only an active passport may enter a terminal lifecycle state' using errcode='DP615';
  end if;

  if p_transition='replaced' then
    if p_reason_code<>'product_replaced' then
      raise exception 'replacement transition requires product_replaced reason code' using errcode='DP404';
    end if;
    if btrim(coalesce(p_replacement_identifier,''))='' then
      raise exception 'replacement identifier is required' using errcode='DP404';
    end if;

    select i.* into v_replacement_item
    from public.dpp_battery_items i
    where i.unique_identifier=btrim(p_replacement_identifier)
      and i.organization_id=v_org;

    if not found then
      raise exception 'replacement must be an active passport in the same organization' using errcode='DP616';
    end if;

    select p.* into v_replacement_passport
    from public.dpp_passports p
    where p.battery_item_id=v_replacement_item.id
      and p.organization_id=v_org;

    if not found or v_replacement_passport.status<>'active' then
      raise exception 'replacement must be an active passport in the same organization' using errcode='DP616';
    end if;
    if v_replacement_passport.id=v_passport.id then
      raise exception 'passport cannot replace itself' using errcode='DP616';
    end if;
  else
    if nullif(btrim(coalesce(p_replacement_identifier,'')),'') is not null then
      raise exception 'replacement identifier is only valid for replaced transition' using errcode='DP404';
    end if;
  end if;

  update public.dpp_passports
  set status=p_transition,
      updated_at=now()
  where id=v_passport.id
  returning * into v_passport;

  insert into public.dpp_passport_lifecycle(
    passport_id,organization_id,disposition,reason_code,reason_note,
    replacement_item_id,changed_by,changed_at
  ) values (
    v_passport.id,v_org,p_transition,p_reason_code,v_reason_note,
    case when p_transition='replaced' then v_replacement_item.id else null end,
    v_user,now()
  )
  on conflict (passport_id) do update set
    disposition=excluded.disposition,
    reason_code=excluded.reason_code,
    reason_note=excluded.reason_note,
    replacement_item_id=excluded.replacement_item_id,
    changed_by=excluded.changed_by,
    changed_at=excluded.changed_at;

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
$function$;

revoke all on function public.dpp_api_scooter_passport_transition(uuid,text,text,text,text,timestamptz)
from public,anon;
grant execute on function public.dpp_api_scooter_passport_transition(uuid,text,text,text,text,timestamptz)
to authenticated;

do $grant$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.dpp_api_scooter_passport_transition(uuid,text,text,text,text,timestamptz) to service_role';
  end if;
end
$grant$;

comment on function public.dpp_api_passport_public_resolve(text) is
  'Public ACTIVE/lifecycle resolver for persistent QR/NFC passport URLs.';
