-- DPP internal RPC surface hardening regression.
-- Caller wraps in BEGIN/ROLLBACK when data fixtures are needed.

do $acl$
begin
  if has_function_privilege('authenticated',to_regprocedure('public.dpp_active_organization_id()'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.dpp_require_active_role(text[])'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.dpp_set_active_organization(uuid)'),'EXECUTE') then
    raise exception 'Internal tenant/RBAC helper regained authenticated EXECUTE';
  end if;

  if (select p.prosecdef from pg_proc p where p.oid=to_regprocedure('public.dpp_request_user_id()')) then
    raise exception 'dpp_request_user_id unexpectedly remains SECURITY DEFINER';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid=to_regprocedure('public.dpp_evidence_storage_org_id(text)')) then
    raise exception 'dpp_evidence_storage_org_id unexpectedly remains SECURITY DEFINER';
  end if;

  if not has_function_privilege('authenticated',to_regprocedure('public.dpp_api_tenant_context()'),'EXECUTE')
     or not has_function_privilege('authenticated',to_regprocedure('public.dpp_api_tenant_context_set(uuid)'),'EXECUTE') then
    raise exception 'Public tenant API RPC lost authenticated EXECUTE';
  end if;
end
$acl$;

do $runtime$
declare
  u uuid := 'b1818181-8181-4181-8181-818181818181';
  org uuid := 'b2828282-8282-4282-8282-828282828282';
  ctx jsonb;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false)',
      u
    );
  else
    insert into auth.users(id) values (u);
  end if;

  insert into public.dpp_organizations(id,name,slug)
  values(org,'Internal RPC Guard Org','internal-rpc-guard-org');
  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(org,u,'owner');

  perform set_config('request.jwt.claim.sub',u::text,true);
  execute 'set local role authenticated';

  ctx:=public.dpp_api_tenant_context_set(org);
  if ctx->>'active_organization_id'<>org::text then
    raise exception 'Tenant API failed after internal helper EXECUTE revoke';
  end if;

  ctx:=public.dpp_api_tenant_context();
  if jsonb_array_length(ctx->'memberships')<>1 then
    raise exception 'Tenant API context failed after helper hardening';
  end if;

  execute 'reset role';
end
$runtime$;

select 'DPP_INTERNAL_RPC_SURFACE_PASS' as result;
