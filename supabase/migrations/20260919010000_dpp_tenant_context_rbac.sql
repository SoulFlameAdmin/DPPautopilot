-- M02/M03 partial precursor: explicit active tenant context + reusable server-side RBAC assertion.
-- M02/M03 remain RED until M01 auth acceptance is complete and the application/API consumes this contract.

alter table public.dpp_organization_members
  add constraint dpp_members_user_org_key unique (user_id,organization_id);

create table public.dpp_user_tenant_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_organization_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint dpp_user_tenant_context_membership_fk
    foreign key (user_id,active_organization_id)
    references public.dpp_organization_members(user_id,organization_id)
    on delete cascade
);

alter table public.dpp_user_tenant_context enable row level security;
revoke all on table public.dpp_user_tenant_context from anon,authenticated;

create policy dpp_user_tenant_context_self_select
on public.dpp_user_tenant_context for select to authenticated
using (user_id=public.dpp_request_user_id());

create or replace function public.dpp_set_active_organization(
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_user uuid;
begin
  v_user:=public.dpp_request_user_id();
  if v_user is null then
    raise exception 'authenticated user context is required'
      using errcode='DP101';
  end if;

  if not exists(
    select 1
    from public.dpp_organization_members m
    where m.user_id=v_user
      and m.organization_id=p_organization_id
  ) then
    raise exception 'user is not a member of organization %',p_organization_id
      using errcode='DP102';
  end if;

  insert into public.dpp_user_tenant_context(user_id,active_organization_id,updated_at)
  values(v_user,p_organization_id,now())
  on conflict(user_id) do update
  set active_organization_id=excluded.active_organization_id,
      updated_at=now();

  return p_organization_id;
end
$fn$;

create or replace function public.dpp_active_organization_id()
returns uuid
language sql
stable
security definer
set search_path=public,pg_temp
as $fn$
  select c.active_organization_id
  from public.dpp_user_tenant_context c
  where c.user_id=public.dpp_request_user_id();
$fn$;

create or replace function public.dpp_require_active_role(
  p_roles text[]
)
returns uuid
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_user uuid;
  v_org uuid;
begin
  v_user:=public.dpp_request_user_id();
  if v_user is null then
    raise exception 'authenticated user context is required'
      using errcode='DP101';
  end if;

  v_org:=public.dpp_active_organization_id();
  if v_org is null then
    raise exception 'active organization is not set'
      using errcode='DP103';
  end if;

  if not exists(
    select 1
    from public.dpp_organization_members m
    where m.user_id=v_user
      and m.organization_id=v_org
      and m.role=any(p_roles)
  ) then
    raise exception 'active organization role is not authorized'
      using errcode='DP104';
  end if;

  return v_org;
end
$fn$;

revoke all on function public.dpp_set_active_organization(uuid) from public,anon;
revoke all on function public.dpp_active_organization_id() from public,anon;
revoke all on function public.dpp_require_active_role(text[]) from public,anon;
grant execute on function public.dpp_set_active_organization(uuid) to authenticated;
grant execute on function public.dpp_active_organization_id() to authenticated;
grant execute on function public.dpp_require_active_role(text[]) to authenticated;

comment on table public.dpp_user_tenant_context is
  'Explicit active organisation per authenticated DPP user; membership FK prevents non-member tenant selection.';
