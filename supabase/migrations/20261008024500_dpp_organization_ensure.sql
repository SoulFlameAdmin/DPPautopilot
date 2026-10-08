-- P0 tenant hardening: idempotent organization ensure for concurrent tabs and safe recovery.
-- Serializes onboarding per authenticated user so parallel tabs cannot create duplicate tenants.

create or replace function public.dpp_api_organization_ensure(
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
  v_active uuid;
  v_count integer;
  v_org_id uuid;
  v_org_name text;
  v_org_slug text;
  v_role text;
  v_created jsonb;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dpp_org_ensure:'||v_user::text,0::bigint)
  );

  v_active:=public.dpp_active_organization_id();
  if v_active is not null then
    select o.id,o.name,o.slug,m.role
      into v_org_id,v_org_name,v_org_slug,v_role
    from public.dpp_organization_members m
    join public.dpp_organizations o on o.id=m.organization_id
    where m.user_id=v_user and m.organization_id=v_active;

    if found then
      return jsonb_build_object(
        'organization_id',v_org_id,
        'name',v_org_name,
        'slug',v_org_slug,
        'role',v_role,
        'active',true,
        'idempotent_replay',true
      );
    end if;
  end if;

  select count(*)::integer into v_count
  from public.dpp_organization_members m
  where m.user_id=v_user;

  if v_count=1 then
    select o.id,o.name,o.slug,m.role
      into v_org_id,v_org_name,v_org_slug,v_role
    from public.dpp_organization_members m
    join public.dpp_organizations o on o.id=m.organization_id
    where m.user_id=v_user
    limit 1;

    perform public.dpp_set_active_organization(v_org_id);

    return jsonb_build_object(
      'organization_id',v_org_id,
      'name',v_org_name,
      'slug',v_org_slug,
      'role',v_role,
      'active',true,
      'idempotent_replay',true
    );
  end if;

  if v_count>1 then
    raise exception 'active organization is not set' using errcode='DP103';
  end if;

  v_created:=public.dpp_api_organization_create(btrim(p_name),p_slug);
  return v_created || jsonb_build_object('idempotent_replay',false);
end
$fn$;

revoke all on function public.dpp_api_organization_ensure(text,text) from public,anon;
grant execute on function public.dpp_api_organization_ensure(text,text) to authenticated;

comment on function public.dpp_api_organization_ensure(text,text) is
  'P0 idempotent organization onboarding: serializes same-user creation, restores one unambiguous membership, and never guesses among multiple memberships.';
