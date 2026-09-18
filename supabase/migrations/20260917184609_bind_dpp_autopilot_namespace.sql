-- Canonical record of the F13 DPP namespace binding migration.
-- Originally applied to Supabase project frhletkiuupgksmgxoxc as bind_dpp_autopilot_namespace.

create table if not exists public.dpp_app_binding (
  app_key text primary key,
  repo_full_name text not null,
  binding_mode text not null check (binding_mode in ('shared_project_isolated_namespace')),
  created_at timestamptz not null default now(),
  notes text not null default ''
);

alter table public.dpp_app_binding enable row level security;
revoke all on table public.dpp_app_binding from anon, authenticated;

insert into public.dpp_app_binding (app_key, repo_full_name, binding_mode, notes)
values (
  'dpp-autopilot',
  'SoulFlameAdmin/DPPautopilot',
  'shared_project_isolated_namespace',
  'DPP-owned tables use the dpp_ prefix, migrations and deny-by-default RLS; unrelated shared-project tables are out of scope.'
)
on conflict (app_key) do update
set repo_full_name = excluded.repo_full_name,
    binding_mode = excluded.binding_mode,
    notes = excluded.notes;
