-- M02 precursor: tenant-safe organization discovery for the authenticated caller.
-- Listing memberships does not require an active tenant so a user can recover/switch context safely.

create or replace function public.dpp_api_organizations_list()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_user uuid;
  v_organizations jsonb;
begin
  v_user:=public.dpp_request_user_id();
  if v_user is null then
    raise exception 'authenticated user context is required' using errcode='DP101';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'organization_id',o.id,
        'name',o.name,
        'slug',o.slug,
        'role',m.role,
        'active',coalesce(ctx.active_organization_id=o.id,false)
      )
      order by
        case when ctx.active_organization_id=o.id then 0 else 1 end,
        o.name,
        o.id
    ),
    '[]'::jsonb
  )
  into v_organizations
  from public.dpp_organization_members m
  join public.dpp_organizations o on o.id=m.organization_id
  left join public.dpp_user_tenant_context ctx on ctx.user_id=v_user
  where m.user_id=v_user;

  return v_organizations;
end
$fn$;

revoke all on function public.dpp_api_organizations_list() from public,anon;
grant execute on function public.dpp_api_organizations_list() to authenticated;

comment on function public.dpp_api_organizations_list() is
  'M02 tenant-safe organization discovery for the authenticated caller, including explicit active-tenant state.';
