-- DPP CRYPTO CR12/CR20 service-facing RPC contract.
-- These RPCs use the authenticated caller's org membership for tenant resolution.
-- They expose public aliases/status only; no protected key references or raw proof data.

create or replace function public.dpp_api_nfc_challenge_create(
  p_public_alias text,
  p_challenge_hash text,
  p_context_hash text,
  p_expires_at timestamptz
)
returns table (
  challenge_id uuid,
  battery_item_id uuid,
  public_alias text,
  mode text,
  algorithm_id text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_identity public.dpp_nfc_identities%rowtype;
  v_id uuid;
begin
  select m.organization_id into v_org
  from public.dpp_organization_members m
  where m.user_id=auth.uid()
  order by m.created_at
  limit 1;

  if v_org is null then
    raise exception 'forbidden' using errcode='DP403';
  end if;
  if p_challenge_hash !~ '^[0-9a-f]{64}$' or
     (p_context_hash is not null and p_context_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid challenge hash' using errcode='DP422';
  end if;
  if p_expires_at <= now() or p_expires_at > now()+interval '5 minutes' then
    raise exception 'invalid challenge expiry' using errcode='DP422';
  end if;

  select * into v_identity
  from public.dpp_nfc_identities
  where organization_id=v_org
    and public_alias=p_public_alias
    and lifecycle_state='active';

  if not found then
    raise exception 'identity not found' using errcode='DP404';
  end if;

  insert into public.dpp_nfc_challenges(
    organization_id,battery_item_id,nfc_identity_id,challenge_hash,context_hash,purpose,expires_at
  ) values (
    v_org,v_identity.battery_item_id,v_identity.id,p_challenge_hash,p_context_hash,'strong_verify',p_expires_at
  ) returning id into v_id;

  return query
  select v_id,v_identity.battery_item_id,v_identity.public_alias,
         v_identity.mode,v_identity.algorithm_id,p_expires_at;
end
$fn$;

create or replace function public.dpp_api_nfc_status(
  p_public_alias text
)
returns table (
  public_alias text,
  lifecycle_state text,
  mode text,
  algorithm_id text,
  tamper_state text,
  activated_at timestamptz,
  revoked_at timestamptz
)
language sql
security definer
set search_path=public,pg_temp
stable
as $fn$
  select i.public_alias,i.lifecycle_state,i.mode,i.algorithm_id,
         i.tamper_state,i.activated_at,i.revoked_at
  from public.dpp_nfc_identities i
  join public.dpp_organization_members m
    on m.organization_id=i.organization_id and m.user_id=auth.uid()
  where i.public_alias=p_public_alias
  limit 1
$fn$;

revoke all on function public.dpp_api_nfc_challenge_create(text,text,text,timestamptz)
  from public,anon;
revoke all on function public.dpp_api_nfc_status(text)
  from public,anon;
grant execute on function public.dpp_api_nfc_challenge_create(text,text,text,timestamptz)
  to authenticated;
grant execute on function public.dpp_api_nfc_status(text)
  to authenticated;

comment on function public.dpp_api_nfc_challenge_create(text,text,text,timestamptz) is
  'CR12 authenticated tenant-scoped challenge persistence; challenge bytes remain API-only.';
comment on function public.dpp_api_nfc_status(text) is
  'CR20 authenticated tenant-scoped NFC lifecycle/tamper status projection; no secret references.';
