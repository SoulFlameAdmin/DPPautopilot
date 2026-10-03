-- DPP CRYPTO CR14/CR17 atomic verification finalization.
-- This does NOT verify hardware cryptography. It atomically consumes an already
-- provider-verified challenge and records the resulting audit event.

create or replace function public.dpp_nfc_finalize_verification(
  p_organization_id uuid,
  p_challenge_id uuid,
  p_expected_context_hash text,
  p_result text,
  p_reason_code text,
  p_mode text,
  p_algorithm_id text,
  p_proof_hash text,
  p_counter_value bigint,
  p_tamper_state text
)
returns table (
  verification_id uuid,
  outcome text,
  battery_item_id uuid,
  nfc_identity_id uuid
)
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_consumed record;
  v_event_id uuid;
  v_final_result text;
  v_final_reason text;
begin
  if p_result not in ('authentic','invalid','revoked','unregistered','tampered','backend_error') then
    raise exception 'unsupported verification result' using errcode='DP422';
  end if;
  if p_reason_code is null or length(btrim(p_reason_code)) not between 1 and 80 then
    raise exception 'invalid reason code' using errcode='DP422';
  end if;
  if p_proof_hash is not null and p_proof_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid proof hash' using errcode='DP422';
  end if;

  select * into v_consumed
  from public.dpp_nfc_consume_challenge(
    p_organization_id,p_challenge_id,p_expected_context_hash,p_result
  );

  if v_consumed.outcome='consumed' then
    v_final_result:=p_result;
    v_final_reason:=p_reason_code;
  elsif v_consumed.outcome='replay' then
    v_final_result:='replay';
    v_final_reason:='challenge_replayed';
  elsif v_consumed.outcome='expired' then
    v_final_result:='expired';
    v_final_reason:='challenge_expired';
  else
    v_final_result:='invalid';
    v_final_reason:='challenge_invalid';
  end if;

  insert into public.dpp_nfc_verification_events(
    organization_id,battery_item_id,nfc_identity_id,challenge_id,
    result,reason_code,mode,algorithm_id,proof_hash,counter_value,tamper_state
  ) values (
    p_organization_id,v_consumed.battery_item_id,v_consumed.nfc_identity_id,p_challenge_id,
    v_final_result,v_final_reason,p_mode,p_algorithm_id,p_proof_hash,p_counter_value,p_tamper_state
  ) returning id into v_event_id;

  return query select v_event_id,v_final_result,v_consumed.battery_item_id,v_consumed.nfc_identity_id;
end
$fn$;

revoke all on function public.dpp_nfc_finalize_verification(
  uuid,uuid,text,text,text,text,text,text,bigint,text
) from public,anon,authenticated;

comment on function public.dpp_nfc_finalize_verification(
  uuid,uuid,text,text,text,text,text,text,bigint,text
) is 'CR14/CR17 service-only atomic challenge consumption + append-only verification event finalization.';
