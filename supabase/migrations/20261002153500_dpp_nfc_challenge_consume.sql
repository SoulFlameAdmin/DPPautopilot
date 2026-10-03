-- DPP CRYPTO CR15 atomic challenge consumption.
-- SECURITY DEFINER is intentionally narrow: caller must already possess the exact
-- tenant + challenge + expected context hash. No secret/key material is returned.

create or replace function public.dpp_nfc_consume_challenge(
  p_organization_id uuid,
  p_challenge_id uuid,
  p_expected_context_hash text,
  p_terminal_result text
)
returns table (
  outcome text,
  battery_item_id uuid,
  nfc_identity_id uuid
)
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_challenge public.dpp_nfc_challenges%rowtype;
begin
  if p_terminal_result not in
    ('authentic','invalid','replay','expired','revoked','unregistered','tampered','backend_error')
  then
    raise exception 'unsupported terminal result' using errcode='DP201';
  end if;

  select *
    into v_challenge
  from public.dpp_nfc_challenges
  where organization_id=p_organization_id
    and id=p_challenge_id
  for update;

  if not found then
    return query select 'invalid'::text,null::uuid,null::uuid;
    return;
  end if;

  if v_challenge.consumed_at is not null then
    return query select 'replay'::text,v_challenge.battery_item_id,v_challenge.nfc_identity_id;
    return;
  end if;

  if v_challenge.expires_at <= now() then
    update public.dpp_nfc_challenges
       set consumed_at=now(), terminal_result='expired'
     where organization_id=p_organization_id and id=p_challenge_id;
    return query select 'expired'::text,v_challenge.battery_item_id,v_challenge.nfc_identity_id;
    return;
  end if;

  if v_challenge.context_hash is distinct from p_expected_context_hash then
    update public.dpp_nfc_challenges
       set consumed_at=now(), terminal_result='invalid'
     where organization_id=p_organization_id and id=p_challenge_id;
    return query select 'invalid'::text,v_challenge.battery_item_id,v_challenge.nfc_identity_id;
    return;
  end if;

  update public.dpp_nfc_challenges
     set consumed_at=now(), terminal_result=p_terminal_result
   where organization_id=p_organization_id and id=p_challenge_id;

  return query select 'consumed'::text,v_challenge.battery_item_id,v_challenge.nfc_identity_id;
end
$fn$;

revoke all on function public.dpp_nfc_consume_challenge(uuid,uuid,text,text)
  from public,anon,authenticated;

comment on function public.dpp_nfc_consume_challenge(uuid,uuid,text,text) is
  'CR15 service-only row-locked one-time challenge consumption; replay/expiry/context mismatch fail closed.';
