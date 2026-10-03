-- DPP CRYPTO CR18/CR19/CR20 lifecycle hardening.
-- Service-only lifecycle transitions preserve historical identities and receipts.

alter table public.dpp_nfc_identities
  add column identity_version integer not null default 1 check (identity_version > 0),
  add column replaces_identity_id uuid null,
  add column valid_from timestamptz null,
  add column valid_until timestamptz null,
  add constraint dpp_nfc_identity_replaces_fk
    foreign key (organization_id,replaces_identity_id)
    references public.dpp_nfc_identities(organization_id,id)
    on delete restrict,
  add constraint dpp_nfc_identity_validity_check
    check (valid_until is null or valid_from is null or valid_until > valid_from);

create unique index dpp_nfc_identity_version_per_battery
  on public.dpp_nfc_identities(organization_id,battery_item_id,identity_version);

create or replace function public.dpp_nfc_activate_identity(
  p_organization_id uuid,
  p_identity_id uuid,
  p_proof_of_possession_verified boolean,
  p_configuration_locked boolean
)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare v public.dpp_nfc_identities%rowtype;
begin
  select * into v from public.dpp_nfc_identities
   where organization_id=p_organization_id and id=p_identity_id
   for update;
  if not found then return 'unregistered'; end if;
  if v.lifecycle_state <> 'pending' then return 'invalid_state'; end if;
  if not p_proof_of_possession_verified or not p_configuration_locked then
    return 'evidence_required';
  end if;
  if exists (
    select 1 from public.dpp_nfc_identities x
    where x.organization_id=p_organization_id
      and x.battery_item_id=v.battery_item_id
      and x.lifecycle_state='active'
      and x.id<>v.id
  ) then return 'active_identity_exists'; end if;
  update public.dpp_nfc_identities
     set lifecycle_state='active',activated_at=now(),
         valid_from=coalesce(valid_from,now())
   where organization_id=p_organization_id and id=p_identity_id;
  return 'active';
end $fn$;

create or replace function public.dpp_nfc_revoke_identity(
  p_organization_id uuid,
  p_identity_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare v public.dpp_nfc_identities%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) not between 3 and 240 then
    raise exception 'revocation reason required' using errcode='DP422';
  end if;
  select * into v from public.dpp_nfc_identities
   where organization_id=p_organization_id and id=p_identity_id
   for update;
  if not found then return 'unregistered'; end if;
  if v.lifecycle_state in ('revoked','replaced') then return v.lifecycle_state; end if;
  update public.dpp_nfc_identities
     set lifecycle_state='revoked',revoked_at=now(),revoked_reason=p_reason,
         valid_until=coalesce(valid_until,now())
   where organization_id=p_organization_id and id=p_identity_id;
  return 'revoked';
end $fn$;

create or replace function public.dpp_nfc_mark_replaced(
  p_organization_id uuid,
  p_old_identity_id uuid,
  p_new_identity_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare old_i public.dpp_nfc_identities%rowtype;
declare new_i public.dpp_nfc_identities%rowtype;
begin
  if p_old_identity_id=p_new_identity_id then return 'invalid'; end if;
  select * into old_i from public.dpp_nfc_identities
   where organization_id=p_organization_id and id=p_old_identity_id for update;
  select * into new_i from public.dpp_nfc_identities
   where organization_id=p_organization_id and id=p_new_identity_id for update;
  if old_i.id is null or new_i.id is null then return 'unregistered'; end if;
  if old_i.battery_item_id<>new_i.battery_item_id then return 'battery_mismatch'; end if;
  if new_i.lifecycle_state<>'pending' then return 'new_identity_not_pending'; end if;
  if new_i.identity_version<=old_i.identity_version then return 'version_not_advanced'; end if;

  update public.dpp_nfc_identities
     set lifecycle_state='replaced',revoked_at=now(),
         revoked_reason=coalesce(nullif(btrim(p_reason),''),'identity_replaced'),
         valid_until=coalesce(valid_until,now())
   where organization_id=p_organization_id and id=p_old_identity_id;

  update public.dpp_nfc_identities
     set replaces_identity_id=p_old_identity_id
   where organization_id=p_organization_id and id=p_new_identity_id;
  return 'replacement_pending_activation';
end $fn$;

create or replace function public.dpp_nfc_set_tamper_state(
  p_organization_id uuid,
  p_identity_id uuid,
  p_tamper_state text
)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
begin
  if p_tamper_state not in ('clear','unknown','tampered','service_open') then
    raise exception 'invalid tamper state' using errcode='DP422';
  end if;
  update public.dpp_nfc_identities
     set tamper_state=p_tamper_state
   where organization_id=p_organization_id and id=p_identity_id;
  if not found then return 'unregistered'; end if;
  return p_tamper_state;
end $fn$;

revoke all on function public.dpp_nfc_activate_identity(uuid,uuid,boolean,boolean)
  from public,anon,authenticated;
revoke all on function public.dpp_nfc_revoke_identity(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.dpp_nfc_mark_replaced(uuid,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.dpp_nfc_set_tamper_state(uuid,uuid,text)
  from public,anon,authenticated;

comment on function public.dpp_nfc_activate_identity(uuid,uuid,boolean,boolean) is
  'CR09/CR10 activation gate: proof-of-possession and locked configuration are mandatory.';
comment on function public.dpp_nfc_revoke_identity(uuid,uuid,text) is
  'CR18 irreversible service-only identity revocation preserving historical evidence.';
comment on function public.dpp_nfc_mark_replaced(uuid,uuid,uuid,text) is
  'CR18/CR19 replacement/rotation linkage; new identity remains pending until separately activated.';
comment on function public.dpp_nfc_set_tamper_state(uuid,uuid,text) is
  'CR20 service-only tamper-state transition; physical trust still depends on hardware evidence.';
