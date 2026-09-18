-- DPP Autopilot core schema.
-- Applied to Supabase project frhletkiuupgksmgxoxc as migration dpp_core_schema.
-- DPP-only namespace; unrelated project tables are intentionally untouched.

create table public.dpp_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dpp_organization_members (
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.dpp_battery_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  model_identifier text not null check (length(btrim(model_identifier)) between 1 and 128),
  manufacturer_name text not null check (length(btrim(manufacturer_name)) between 1 and 250),
  category text not null check (category in ('portable','light_means_of_transport','starting_lighting_ignition','industrial','electric_vehicle','other')),
  canonical_data jsonb not null default '{}'::jsonb check (jsonb_typeof(canonical_data) = 'object'),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, model_identifier),
  unique (organization_id, id)
);

create table public.dpp_battery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  model_id uuid not null,
  unique_identifier text not null unique check (length(btrim(unique_identifier)) between 1 and 300),
  lifecycle_status text not null default 'original' check (lifecycle_status in ('original','repurposed','remanufactured','second_life','waste','retired')),
  canonical_data jsonb not null default '{}'::jsonb check (jsonb_typeof(canonical_data) = 'object'),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint dpp_battery_items_org_model_fk
    foreign key (organization_id, model_id)
    references public.dpp_battery_models(organization_id, id)
    on delete restrict
);

create table public.dpp_passports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  battery_item_id uuid not null,
  status text not null default 'draft' check (status in ('draft','active','suspended','retired')),
  public_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(public_payload) = 'object'),
  private_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(private_payload) = 'object'),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, battery_item_id),
  constraint dpp_passports_org_item_fk
    foreign key (organization_id, battery_item_id)
    references public.dpp_battery_items(organization_id, id)
    on delete cascade
);

comment on table public.dpp_organizations is 'DPP Autopilot tenant organisations.';
comment on table public.dpp_organization_members is 'DPP Autopilot organisation membership and role bindings.';
comment on table public.dpp_battery_models is 'Tenant-scoped canonical battery model records.';
comment on table public.dpp_battery_items is 'Tenant-scoped individual battery records linked to a battery model.';
comment on table public.dpp_passports is 'Tenant-scoped battery passport projection with explicit public/private payload split.';

alter table public.dpp_organizations enable row level security;
alter table public.dpp_organization_members enable row level security;
alter table public.dpp_battery_models enable row level security;
alter table public.dpp_battery_items enable row level security;
alter table public.dpp_passports enable row level security;

revoke all on table public.dpp_organizations from anon, authenticated;
revoke all on table public.dpp_organization_members from anon, authenticated;
revoke all on table public.dpp_battery_models from anon, authenticated;
revoke all on table public.dpp_battery_items from anon, authenticated;
revoke all on table public.dpp_passports from anon, authenticated;
