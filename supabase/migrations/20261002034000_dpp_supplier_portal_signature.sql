-- BAT52/BAT56 Supplier portal membership/invitation + signature envelope foundation.
-- No raw invite tokens or private signing material are stored.

create table public.dpp_supplier_portal_members (
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  supplier_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('supplier_editor','supplier_viewer')),
  status text not null default 'active' check (status in ('active','suspended','revoked')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id,supplier_id,user_id),
  constraint dpp_supplier_portal_members_org_supplier_fk
    foreign key (organization_id,supplier_id)
    references public.dpp_suppliers(organization_id,id)
    on delete cascade
);

create index dpp_supplier_portal_members_user_idx
  on public.dpp_supplier_portal_members(user_id,organization_id,supplier_id);

create table public.dpp_supplier_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  supplier_id uuid not null,
  invitee_email text not null check (
    length(btrim(invitee_email)) between 3 and 320
    and invitee_email = lower(btrim(invitee_email))
  ),
  requested_role text not null check (requested_role in ('supplier_editor','supplier_viewer')),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  accepted_by uuid null references auth.users(id) on delete set null,
  accepted_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint dpp_supplier_invitations_org_supplier_fk
    foreign key (organization_id,supplier_id)
    references public.dpp_suppliers(organization_id,id)
    on delete cascade,
  constraint dpp_supplier_invitation_acceptance_state_check check (
    (status='accepted' and accepted_by is not null and accepted_at is not null)
    or
    (status<>'accepted' and accepted_at is null)
  )
);

create index dpp_supplier_invitations_pending_idx
  on public.dpp_supplier_invitations(
    organization_id,supplier_id,status,expires_at
  );

create table public.dpp_supplier_package_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  package_id uuid not null,
  scheme text not null check (scheme in ('jws','cose','x509_detached')),
  key_ref text not null check (length(btrim(key_ref)) between 1 and 500),
  algorithm text not null check (length(btrim(algorithm)) between 1 and 80),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_base64 text not null check (length(btrim(signature_base64)) between 16 and 16384),
  signed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint dpp_supplier_package_signatures_org_package_fk
    foreign key (organization_id,package_id)
    references public.dpp_supplier_data_packages(organization_id,id)
    on delete restrict
);

create index dpp_supplier_package_signatures_package_idx
  on public.dpp_supplier_package_signatures(
    organization_id,package_id,signed_at desc,id desc
  );

alter table public.dpp_supplier_portal_members enable row level security;
alter table public.dpp_supplier_invitations enable row level security;
alter table public.dpp_supplier_package_signatures enable row level security;

revoke all on table public.dpp_supplier_portal_members from anon,authenticated;
revoke all on table public.dpp_supplier_invitations from anon,authenticated;
revoke all on table public.dpp_supplier_package_signatures from anon,authenticated;

create or replace function public.dpp_reject_supplier_signature_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $fn$
begin
  raise exception 'dpp_supplier_package_signatures is append-only'
    using errcode='55000';
end;
$fn$;

revoke all on function public.dpp_reject_supplier_signature_mutation() from public,anon,authenticated;

create trigger dpp_supplier_package_signatures_append_only
before update or delete on public.dpp_supplier_package_signatures
for each row execute function public.dpp_reject_supplier_signature_mutation();

comment on table public.dpp_supplier_invitations is
  'BAT52 supplier portal invitations. Stores only SHA-256 token digest; raw invite token must remain outside persistent storage.';
comment on table public.dpp_supplier_package_signatures is
  'BAT56 crypto-agnostic detached supplier signature envelopes. No private keys or signing secrets are stored.';
