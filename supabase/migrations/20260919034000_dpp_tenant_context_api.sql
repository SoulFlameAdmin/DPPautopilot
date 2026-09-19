-- M02/M03 tenant context API: expose only the authenticated user's memberships and explicit active tenant.
-- No direct organisation/member table grants are added; all access remains behind SECURITY DEFINER RPCs.

create or replace function public.dpp_api_tenant_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_user uuid;
  v_active uuid;
  v_memberships jsonb;
begin
  v_user:=public.dpp_request_user_id();
  if v_user is null then
    raise exception 'authenticated user context is required'
      using errcode='DP101';
  end if;

  v_active:=public.dpp_active_organization_id();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'organization_id',m.organization_id,
        'name',o.name,
        'slug',o.slug,
        'role',m.role,
        'active',(m.organization_id=v_active)
      )
      order by o.name,o.id
    ),
    '[]'::jsonb
  )
  into v_memberships
  from public.dpp_organization_members m
  join public.dpp_organizations o on o.id=m.organization_id
  where m.user_id=v_user;

  return jsonb_build_object(
    'active_organization_id',v_active,
    'memberships',v_memberships
  );
end
$fn$;

create or replace function public.dpp_api_tenant_context_set(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
begin
  perform public.dpp_set_active_organization(p_organization_id);
  return public.dpp_api_tenant_context();
end
$fn$;

revoke all on function public.dpp_api_tenant_context() from public,anon;
revoke all on function public.dpp_api_tenant_context_set(uuid) from public,anon;
grant execute on function public.dpp_api_tenant_context() to authenticated;
grant execute on function public.dpp_api_tenant_context_set(uuid) to authenticated;

comment on function public.dpp_api_tenant_context() is
  'M02/M03 authenticated tenant context: only caller memberships, roles and explicit active organisation.';
comment on function public.dpp_api_tenant_context_set(uuid) is
  'M02/M03 membership-checked active organisation switch returning the resulting caller tenant context.';
