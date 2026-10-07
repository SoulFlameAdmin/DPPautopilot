create table if not exists public.dpp_early_access_sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  status text not null default 'link_sent'
    check (status in ('link_sent','opened','submitted','reviewing','quoted','activated','rejected')),
  country text not null default '',
  company_name text not null default '',
  manufacturer text not null default '',
  request_text text not null default '',
  created_at timestamptz not null default now(),
  opened_at timestamptz null,
  submitted_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  updated_at timestamptz not null default now(),
  constraint dpp_early_access_email_ck
    check (char_length(email) between 3 and 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint dpp_early_access_country_ck check (char_length(country) <= 120),
  constraint dpp_early_access_company_ck check (char_length(company_name) <= 200),
  constraint dpp_early_access_manufacturer_ck check (char_length(manufacturer) <= 200),
  constraint dpp_early_access_request_ck check (char_length(request_text) <= 5000)
);

create index if not exists dpp_early_access_sessions_email_idx
  on public.dpp_early_access_sessions (lower(email), created_at desc);

create index if not exists dpp_early_access_sessions_status_idx
  on public.dpp_early_access_sessions (status, updated_at desc);

alter table public.dpp_early_access_sessions enable row level security;
revoke all on table public.dpp_early_access_sessions from public, anon, authenticated;
