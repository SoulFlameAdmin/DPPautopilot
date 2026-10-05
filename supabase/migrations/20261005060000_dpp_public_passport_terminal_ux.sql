-- Step 21: public terminal passport lifecycle UX.
-- Keep old QR identifiers resolvable without exposing private payloads.
-- "revoked" is represented by suspended + public_terminal_state=revoked.
-- "replaced"/"retired" are represented by retired + the matching public terminal state.

alter table public.dpp_passports
  add column public_terminal_state text null,
  add column replacement_identifier text null;

alter table public.dpp_passports
  add constraint dpp_passports_public_terminal_state_check
  check (
    public_terminal_state is null
    or public_terminal_state in ('revoked','replaced','retired')
  ),
  add constraint dpp_passports_replacement_identifier_check
  check (
    replacement_identifier is null
    or length(btrim(replacement_identifier)) between 1 and 300
  ),
  add constraint dpp_passports_terminal_combo_check
  check (
    (public_terminal_state is null and replacement_identifier is null)
    or (public_terminal_state in ('revoked','retired') and replacement_identifier is null)
    or (public_terminal_state='replaced' and replacement_identifier is not null)
  ),
  add constraint dpp_passports_terminal_status_check
  check (
    public_terminal_state is null
    or (public_terminal_state='revoked' and status='suspended')
    or (public_terminal_state in ('replaced','retired') and status='retired')
  );

update public.dpp_passports
set public_terminal_state='retired'
where status='retired' and public_terminal_state is null;

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
    'public_state',
      case
        when p.status='active' and p.public_terminal_state is null then 'active'
        when p.public_terminal_state is not null then p.public_terminal_state
        when p.status='retired' then 'retired'
        else 'unavailable'
      end,
    'replacement_identifier',
      case when p.public_terminal_state='replaced' then p.replacement_identifier else null end,
    'public_payload',
      case
        when p.status='active' and p.public_terminal_state is null then p.public_payload
        else '{}'::jsonb
      end,
    'updated_at',p.updated_at
  )
  into v_result
  from public.dpp_passports p
  join public.dpp_battery_items i
    on i.id=p.battery_item_id
   and i.organization_id=p.organization_id
  where i.unique_identifier=btrim(p_unique_identifier)
    and (
      p.status='active'
      or p.status in ('suspended','retired')
      or p.public_terminal_state is not null
    );

  if v_result is null then
    raise exception 'public passport not found' using errcode='DP402';
  end if;

  return v_result;
end
$fn$;

revoke all on function public.dpp_api_passport_public(text) from public,authenticated;
grant execute on function public.dpp_api_passport_public(text) to anon,authenticated;

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
    'public_terminal_state',p.public_terminal_state,
    'replacement_identifier',p.replacement_identifier,
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

revoke all on function public.dpp_api_passport_private(uuid) from public,anon;
grant execute on function public.dpp_api_passport_private(uuid) to authenticated;

create or replace function public.dpp_api_passport_terminalize(
  p_id uuid,
  p_terminal_state text,
  p_replacement_identifier text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_passport public.dpp_passports%rowtype;
  v_replacement text;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  if p_terminal_state is null or p_terminal_state not in ('revoked','replaced','retired') then
    raise exception 'unsupported public terminal state' using errcode='DP612';
  end if;

  select p.* into v_passport
  from public.dpp_passports p
  where p.id=p_id and p.organization_id=v_org
  for update;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;
  if p_expected_updated_at is null or v_passport.updated_at is distinct from p_expected_updated_at then
    raise exception 'passport changed since it was read' using errcode='DP411';
  end if;

  if p_terminal_state='replaced' then
    v_replacement:=btrim(coalesce(p_replacement_identifier,''));
    if length(v_replacement) not between 1 and 300 then
      raise exception 'replacement identifier is required' using errcode='DP612';
    end if;
    if exists (
      select 1
      from public.dpp_battery_items self_i
      where self_i.id=v_passport.battery_item_id
        and self_i.organization_id=v_org
        and self_i.unique_identifier=v_replacement
    ) then
      raise exception 'replacement passport must be different' using errcode='DP613';
    end if;
    if not exists (
      select 1
      from public.dpp_battery_items ri
      join public.dpp_passports rp
        on rp.battery_item_id=ri.id
       and rp.organization_id=ri.organization_id
      where ri.organization_id=v_org
        and ri.unique_identifier=v_replacement
        and rp.status='active'
        and rp.public_terminal_state is null
    ) then
      raise exception 'replacement passport is not an active passport in this organization' using errcode='DP613';
    end if;
  elsif p_replacement_identifier is not null then
    raise exception 'replacement identifier is only valid for replaced passports' using errcode='DP612';
  end if;

  update public.dpp_passports
  set status=case when p_terminal_state='revoked' then 'suspended' else 'retired' end,
      public_terminal_state=p_terminal_state,
      replacement_identifier=case when p_terminal_state='replaced' then v_replacement else null end,
      updated_at=now()
  where id=v_passport.id and organization_id=v_org
  returning * into v_passport;

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'battery_item_id',v_passport.battery_item_id,
    'status',v_passport.status,
    'public_terminal_state',v_passport.public_terminal_state,
    'replacement_identifier',v_passport.replacement_identifier,
    'public_payload',v_passport.public_payload,
    'private_payload',v_passport.private_payload,
    'created_at',v_passport.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;

revoke all on function public.dpp_api_passport_terminalize(uuid,text,text,timestamptz)
from public,anon;
grant execute on function public.dpp_api_passport_terminalize(uuid,text,text,timestamptz)
to authenticated;

comment on function public.dpp_api_passport_public(text) is
  'Step 21 public resolver: ACTIVE passports return the public payload; revoked/replaced/retired passports return a fail-closed public tombstone.';
comment on function public.dpp_api_passport_terminalize(uuid,text,text,timestamptz) is
  'Step 21 tenant-scoped terminal transition. Replaced passports may point only to a different ACTIVE passport in the same organization.';
