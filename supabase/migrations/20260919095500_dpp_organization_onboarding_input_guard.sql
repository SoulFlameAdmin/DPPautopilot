-- M02/M03 onboarding input-contract hardening.
-- SQL NOT IN returns NULL for a NULL operand; reject NULL roles explicitly before table constraints.

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

  if p_user_id is null or p_role is null or p_role not in ('admin','editor','viewer') then
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

  if p_user_id is null or p_role is null or p_role not in ('admin','editor','viewer') then
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
