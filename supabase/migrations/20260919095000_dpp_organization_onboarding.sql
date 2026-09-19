-- M02/M03/M24 precursor: authenticated organization onboarding and tenant-scoped membership management.
-- Generic member management never creates/modifies/deletes the owner role; ownership transfer is intentionally out of scope.

create or replace function public.dpp_api_organization_create(
  p_name text,
  p_slug text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_user uuid;
  v_org public.dpp_organizations%rowtype;
begin
  v_user:=public.dpp_request_user_id();
  if v_user is null then
    raise exception 'authenticated user context is required' using errcode='DP101';
  end if;

  if p_name is null or length(btrim(p_name))<1 or length(btrim(p_name))>200 then
    raise exception 'organization name is invalid' using errcode='DP501';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug)>120 then
    raise exception 'organization slug is invalid' using errcode='DP501';
  end if;

  insert into public.dpp_organizations(name,slug)
  values(btrim(p_name),p_slug)
  returning * into v_org;

  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(v_org.id,v_user,'owner');

  insert into public.dpp_user_tenant_context(user_id,active_organization_id,updated_at)
  values(v_user,v_org.id,now())
  on conflict(user_id) do update
  set active_organization_id=excluded.active_organization_id,
      updated_at=now();

  return jsonb_build_object(
    'organization_id',v_org.id,
    'name',v_org.name,
    'slug',v_org.slug,
    'role','owner',
    'active',true
  );
end
$fn$;

create or replace function public.dpp_api_members_list()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_members jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id',m.user_id,
        'role',m.role,
        'created_at',m.created_at
      )
      order by
        case m.role when 'owner' then 1 when 'admin' then 2 when 'editor' then 3 else 4 end,
        m.created_at,
        m.user_id
    ),
    '[]'::jsonb
  )
  into v_members
  from public.dpp_organization_members m
  where m.organization_id=v_org;

  return v_members;
end
$fn$;

create or replace function public.dpp_api_members_add(
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_actor uuid;
  v_actor_role text;
  v_created_at timestamptz;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);
  v_actor:=public.dpp_request_user_id();

  select m.role into v_actor_role
  from public.dpp_organization_members m
  where m.organization_id=v_org and m.user_id=v_actor;

  if p_user_id is null or p_role not in ('admin','editor','viewer') then
    raise exception 'member input is invalid' using errcode='DP501';
  end if;
  if v_actor_role='admin' and p_role='admin' then
    raise exception 'admin cannot grant admin or owner role' using errcode='DP104';
  end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then
    raise exception 'target user not found' using errcode='DP502';
  end if;
  if exists(
    select 1 from public.dpp_organization_members m
    where m.organization_id=v_org and m.user_id=p_user_id
  ) then
    raise exception 'member already exists' using errcode='DP505';
  end if;

  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(v_org,p_user_id,p_role)
  returning created_at into v_created_at;

  return jsonb_build_object('user_id',p_user_id,'role',p_role,'created_at',v_created_at);
end
$fn$;

create or replace function public.dpp_api_members_update(
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_actor uuid;
  v_actor_role text;
  v_target_role text;
  v_created_at timestamptz;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);
  v_actor:=public.dpp_request_user_id();

  select m.role into v_actor_role
  from public.dpp_organization_members m
  where m.organization_id=v_org and m.user_id=v_actor;

  if p_user_id is null or p_role not in ('admin','editor','viewer') then
    raise exception 'member input is invalid' using errcode='DP501';
  end if;

  select m.role,m.created_at
  into v_target_role,v_created_at
  from public.dpp_organization_members m
  where m.organization_id=v_org and m.user_id=p_user_id;

  if v_target_role is null then
    raise exception 'member not found' using errcode='DP503';
  end if;
  if v_target_role='owner' then
    raise exception 'owner role requires a dedicated ownership-transfer flow' using errcode='DP104';
  end if;
  if v_actor_role='admin' and (v_target_role='admin' or p_role='admin') then
    raise exception 'admin cannot manage admin or owner roles' using errcode='DP104';
  end if;

  update public.dpp_organization_members
  set role=p_role
  where organization_id=v_org and user_id=p_user_id;

  return jsonb_build_object('user_id',p_user_id,'role',p_role,'created_at',v_created_at);
end
$fn$;

create or replace function public.dpp_api_members_delete(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_actor uuid;
  v_actor_role text;
  v_target_role text;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);
  v_actor:=public.dpp_request_user_id();

  select m.role into v_actor_role
  from public.dpp_organization_members m
  where m.organization_id=v_org and m.user_id=v_actor;

  select m.role into v_target_role
  from public.dpp_organization_members m
  where m.organization_id=v_org and m.user_id=p_user_id;

  if v_target_role is null then
    raise exception 'member not found' using errcode='DP503';
  end if;
  if v_target_role='owner' then
    raise exception 'owner cannot be removed by generic member management' using errcode='DP104';
  end if;
  if v_actor_role='admin' and v_target_role='admin' then
    raise exception 'admin cannot remove another admin' using errcode='DP104';
  end if;

  delete from public.dpp_organization_members
  where organization_id=v_org and user_id=p_user_id;

  return p_user_id;
end
$fn$;

revoke all on function public.dpp_api_organization_create(text,text) from public,anon;
revoke all on function public.dpp_api_members_list() from public,anon;
revoke all on function public.dpp_api_members_add(uuid,text) from public,anon;
revoke all on function public.dpp_api_members_update(uuid,text) from public,anon;
revoke all on function public.dpp_api_members_delete(uuid) from public,anon;

grant execute on function public.dpp_api_organization_create(text,text) to authenticated;
grant execute on function public.dpp_api_members_list() to authenticated;
grant execute on function public.dpp_api_members_add(uuid,text) to authenticated;
grant execute on function public.dpp_api_members_update(uuid,text) to authenticated;
grant execute on function public.dpp_api_members_delete(uuid) to authenticated;

comment on function public.dpp_api_organization_create(text,text) is
  'M02/M24 authenticated organization creation: atomically creates the organization, caller owner membership and active tenant context.';
comment on function public.dpp_api_members_list() is
  'M03 tenant-scoped membership list for the active organization.';
comment on function public.dpp_api_members_add(uuid,text) is
  'M03 tenant-scoped member add; owner role is intentionally unavailable via generic member management.';
comment on function public.dpp_api_members_update(uuid,text) is
  'M03 tenant-scoped role update with owner/admin anti-escalation rules.';
comment on function public.dpp_api_members_delete(uuid) is
  'M03 tenant-scoped member removal; owner removal is intentionally unavailable via generic member management.';
