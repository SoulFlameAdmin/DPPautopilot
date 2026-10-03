-- DPP CRYPTO CR03/CR10/CR12/CR17 additive persistence.
-- Canonical battery binding approved in Issue #241:
-- (organization_id, battery_item_id) -> public.dpp_battery_items(organization_id, id).
-- No raw private keys, symmetric keys, master keys or challenge proof material are stored here.

create table public.dpp_nfc_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  battery_item_id uuid not null,
  public_alias text not null check (public_alias ~ '^[A-Za-z0-9_-]{8,160}$'),
  identity_fingerprint text not null check (length(identity_fingerprint) between 16 and 256),
  mode text not null check (mode in ('pki_ecc','aes_sun')),
  algorithm_id text not null check (length(btrim(algorithm_id)) between 1 and 100),
  public_key_or_certificate_fingerprint text null,
  protected_key_reference_fingerprint text null,
  lifecycle_state text not null default 'pending'
    check (lifecycle_state in ('pending','active','revoked','replaced')),
  tamper_capability text null,
  tamper_state text null,
  provisioned_at timestamptz null,
  activated_at timestamptz null,
  revoked_at timestamptz null,
  revoked_reason text null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (public_alias),
  unique (organization_id, identity_fingerprint),
  constraint dpp_nfc_identity_battery_fk
    foreign key (organization_id, battery_item_id)
    references public.dpp_battery_items(organization_id, id)
    on delete restrict,
  constraint dpp_nfc_identity_key_reference_check
    check (
      (mode='pki_ecc' and public_key_or_certificate_fingerprint is not null
                      and protected_key_reference_fingerprint is null)
      or
      (mode='aes_sun' and protected_key_reference_fingerprint is not null
                      and public_key_or_certificate_fingerprint is null)
    ),
  constraint dpp_nfc_identity_revocation_check
    check (
      (lifecycle_state in ('revoked','replaced') and revoked_at is not null)
      or
      (lifecycle_state in ('pending','active') and revoked_at is null)
    )
);

create unique index dpp_nfc_one_active_identity_per_battery
  on public.dpp_nfc_identities(organization_id,battery_item_id)
  where lifecycle_state='active';

create table public.dpp_nfc_provisioning_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  battery_item_id uuid not null,
  nfc_identity_id uuid not null,
  station_id text not null check (length(btrim(station_id)) between 1 and 160),
  mode text not null check (mode in ('pki_ecc','aes_sun')),
  algorithm_id text not null check (length(btrim(algorithm_id)) between 1 and 100),
  identity_fingerprint text not null,
  key_reference_fingerprint text null,
  configuration_locked boolean not null,
  proof_of_possession_verified boolean not null,
  result text not null check (result in ('success','failed')),
  provisioned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dpp_nfc_receipt_battery_fk
    foreign key (organization_id,battery_item_id)
    references public.dpp_battery_items(organization_id,id)
    on delete restrict,
  constraint dpp_nfc_receipt_identity_fk
    foreign key (organization_id,nfc_identity_id)
    references public.dpp_nfc_identities(organization_id,id)
    on delete restrict
);

create table public.dpp_nfc_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  battery_item_id uuid null,
  nfc_identity_id uuid null,
  challenge_hash text not null check (challenge_hash ~ '^[0-9a-f]{64}$'),
  context_hash text null check (context_hash is null or context_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null default 'strong_verify'
    check (purpose in ('strong_verify','provisioning_proof')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  terminal_result text null
    check (terminal_result is null or terminal_result in
      ('authentic','invalid','replay','expired','revoked','unregistered','tampered','backend_error')),
  unique (organization_id,id),
  constraint dpp_nfc_challenge_expiry_check check (expires_at > issued_at),
  constraint dpp_nfc_challenge_battery_fk
    foreign key (organization_id,battery_item_id)
    references public.dpp_battery_items(organization_id,id)
    on delete restrict,
  constraint dpp_nfc_challenge_identity_fk
    foreign key (organization_id,nfc_identity_id)
    references public.dpp_nfc_identities(organization_id,id)
    on delete restrict
);

create index dpp_nfc_challenge_lookup
  on public.dpp_nfc_challenges(organization_id,id,expires_at);

create table public.dpp_nfc_verification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  battery_item_id uuid null,
  nfc_identity_id uuid null,
  challenge_id uuid null,
  result text not null
    check (result in ('authentic','invalid','replay','expired','revoked','unregistered','tampered','backend_error')),
  reason_code text not null check (length(btrim(reason_code)) between 1 and 80),
  protocol_schema text not null default 'dpp.nfc.verification.v1',
  mode text null check (mode is null or mode in ('pki_ecc','aes_sun')),
  algorithm_id text null,
  proof_hash text null check (proof_hash is null or proof_hash ~ '^[0-9a-f]{64}$'),
  counter_value bigint null,
  tamper_state text null,
  verified_at timestamptz not null default now(),
  constraint dpp_nfc_event_battery_fk
    foreign key (organization_id,battery_item_id)
    references public.dpp_battery_items(organization_id,id)
    on delete restrict,
  constraint dpp_nfc_event_identity_fk
    foreign key (organization_id,nfc_identity_id)
    references public.dpp_nfc_identities(organization_id,id)
    on delete restrict,
  constraint dpp_nfc_event_challenge_fk
    foreign key (organization_id,challenge_id)
    references public.dpp_nfc_challenges(organization_id,id)
    on delete restrict
);

create unique index dpp_nfc_unique_identity_proof_hash
  on public.dpp_nfc_verification_events(organization_id,nfc_identity_id,proof_hash)
  where nfc_identity_id is not null and proof_hash is not null;

alter table public.dpp_nfc_identities enable row level security;
alter table public.dpp_nfc_provisioning_receipts enable row level security;
alter table public.dpp_nfc_challenges enable row level security;
alter table public.dpp_nfc_verification_events enable row level security;

revoke all on table public.dpp_nfc_identities from anon,authenticated;
revoke all on table public.dpp_nfc_provisioning_receipts from anon,authenticated;
revoke all on table public.dpp_nfc_challenges from anon,authenticated;
revoke all on table public.dpp_nfc_verification_events from anon,authenticated;

-- Authenticated UI reads are tenant/RBAC scoped. Mutations remain service/RPC controlled.
create policy dpp_nfc_identities_member_select
on public.dpp_nfc_identities for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));

create policy dpp_nfc_receipts_admin_select
on public.dpp_nfc_provisioning_receipts for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_nfc_events_admin_select
on public.dpp_nfc_verification_events for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

comment on table public.dpp_nfc_identities is
  'CR03 tenant-scoped Battery ID to Secure NFC cryptographic identity bindings; no raw secret material.';
comment on table public.dpp_nfc_provisioning_receipts is
  'CR10 append-only secret-free Secure NFC provisioning evidence.';
comment on table public.dpp_nfc_challenges is
  'CR12 one-time Secure NFC challenge state; stores challenge hashes, not secret key material.';
comment on table public.dpp_nfc_verification_events is
  'CR17 append-only Secure NFC verification history; stores proof fingerprints, not raw proofs.';
