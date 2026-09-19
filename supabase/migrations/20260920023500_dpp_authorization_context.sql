-- M03 precursor: expose authoritative tenant role/capability context for the authenticated caller.
-- Enforcement remains in server-side RPCs/RLS; this function is discovery-only.

create or replace function public.dpp_api_authorization_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_role text;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);
  v_user:=public.dpp_request_user_id();

  select m.role
  into v_role
  from public.dpp_organization_members m
  where m.organization_id=v_org
    and m.user_id=v_user;

  if v_role is null then
    raise exception 'active organization membership is required' using errcode='DP103';
  end if;

  return jsonb_build_object(
    'organization_id',v_org,
    'user_id',v_user,
    'role',v_role,
    'capabilities',jsonb_build_object(
      'members_read',true,
      'members_manage',v_role in ('owner','admin'),
      'admin_manage',v_role='owner',
      'records_write',v_role in ('owner','admin','editor'),
      'private_read',true
    )
  );
end
$fn$;

revoke all on function public.dpp_api_authorization_context() from public,anon;
grant execute on function public.dpp_api_authorization_context() to authenticated;

comment on function public.dpp_api_authorization_context() is
  'M03 authenticated active-tenant role/capability discovery. This does not replace server-side authorization enforcement.';