-- Step 2: customer-grade DPP team RBAC helpers.
-- Adds email-based member onboarding without exposing auth.users to the client.
-- Acceptance note: authenticated RPC exposure is explicitly covered by the DPP SECURITY DEFINER guard.

create or replace function public.dpp_api_members_list_detail()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org uuid;
  v_user uuid;
  v_members jsonb;
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor','viewer']);
  v_user := public.dpp_request_user_id();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'email', u.email,
        'role', m.role,
        'created_at', m.created_at,
        'is_self', (m.user_id = v_user)
      )
      order by
        case m.role when 'owner' then 1 when 'admin' then 2 when 'editor' then 3 else 4 end,
        lower(coalesce(u.email,'')),
        m.user_id
    ),
    '[]'::jsonb
  )
  into v_members
  from public.dpp_organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = v_org;

  return v_members;
end
$function$;

create or replace function public.dpp_api_member_add_by_email(p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org uuid;
  v_actor uuid;
  v_actor_role text;
  v_target uuid;
  v_email text;
  v_created_at timestamptz;
begin
  v_org := public.dpp_require_active_role(array['owner','admin']);
  v_actor := public.dpp_request_user_id();

  select m.role
  into v_actor_role
  from public.dpp_organization_members m
  where m.organization_id = v_org and m.user_id = v_actor;

  v_email := lower(btrim(coalesce(p_email,'')));

  if length(v_email) < 3
     or length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_role is null
     or p_role not in ('admin','editor','viewer') then
    raise exception 'member input is invalid' using errcode='DP501';
  end if;

  if v_actor_role = 'admin' and p_role = 'admin' then
    raise exception 'admin cannot grant admin or owner role' using errcode='DP104';
  end if;

  select u.id
  into v_target
  from auth.users u
  where lower(u.email) = v_email
    and u.email_confirmed_at is not null
  limit 1;

  if v_target is null then
    raise exception 'target user not found' using errcode='DP502';
  end if;

  if exists(
    select 1
    from public.dpp_organization_members m
    where m.organization_id = v_org and m.user_id = v_target
  ) then
    raise exception 'member already exists' using errcode='DP505';
  end if;

  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(v_org,v_target,p_role)
  returning created_at into v_created_at;

  return jsonb_build_object(
    'user_id',v_target,
    'email',v_email,
    'role',p_role,
    'created_at',v_created_at,
    'is_self',(v_target=v_actor)
  );
end
$function$;

revoke all on function public.dpp_api_members_list_detail() from public, anon;
revoke all on function public.dpp_api_member_add_by_email(text,text) from public, anon;
grant execute on function public.dpp_api_members_list_detail() to authenticated;
grant execute on function public.dpp_api_member_add_by_email(text,text) to authenticated;
