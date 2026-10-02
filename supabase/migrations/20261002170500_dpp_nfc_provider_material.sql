-- DPP CRYPTO CR06/CR07 verification-material projection.
-- Public-key material is non-secret. Symmetric secrets remain behind KMS/HSM;
-- DB stores only a protected reference fingerprint, never the key itself.

alter table public.dpp_nfc_identities
  add column public_key_pem text null,
  add constraint dpp_nfc_public_key_mode_check
    check (
      (mode='pki_ecc' and public_key_pem is not null and public_key_pem like '%PUBLIC KEY%')
      or
      (mode='aes_sun' and public_key_pem is null)
    );

create or replace function public.dpp_nfc_provider_identity(
  p_organization_id uuid,
  p_public_alias text
)
returns table (
  nfc_identity_id uuid,
  battery_item_id uuid,
  lifecycle_state text,
  mode text,
  algorithm_id text,
  public_key_pem text,
  protected_key_reference_fingerprint text,
  tamper_state text,
  valid_from timestamptz,
  valid_until timestamptz
)
language sql
security definer
set search_path=public,pg_temp
stable
as $fn$
  select i.id,i.battery_item_id,i.lifecycle_state,i.mode,i.algorithm_id,
         i.public_key_pem,i.protected_key_reference_fingerprint,
         i.tamper_state,i.valid_from,i.valid_until
  from public.dpp_nfc_identities i
  where i.organization_id=p_organization_id
    and i.public_alias=p_public_alias
  limit 1
$fn$;

revoke all on function public.dpp_nfc_provider_identity(uuid,text)
  from public,anon,authenticated;

comment on function public.dpp_nfc_provider_identity(uuid,text) is
  'CR06/CR07 service-only provider projection. AES reference is a fingerprint/lookup token, never raw key material.';
