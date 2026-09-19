-- M02/M03 tenant context API subset.
-- Synthetic users only; caller must wrap this file in a rollback transaction.

do $seed$
declare
  u_owner uuid := 'a1818181-8181-4181-8181-818181818181';
  u_editor uuid := 'a2828282-8282-4282-8282-828282828282';
  org_a uuid := 'a3838383-8383-4383-8383-838383838383';
  org_b uuid := 'a4848484-8484-4484-8484-848484848484';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_editor
    );
  else
    insert into auth.users(id) values (u_owner),(u_editor);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'Tenant API A','tenant-api-a'),
    (org_b,'Tenant API B','tenant-api-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_b,u_owner,'admin'),
    (org_a,u_editor,'editor');
end
$seed$;

do $matrix$
declare
  org_a uuid := 'a3838383-8383-4383-8383-838383838383';
  org_b uuid := 'a4848484-8484-4484-8484-848484848484';
  ctx jsonb;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','a1818181-8181-4181-8181-818181818181',true);
  ctx:=public.dpp_api_tenant_context();

  if jsonb_array_length(ctx->'memberships')<>2 then
    raise exception 'M02 tenant API did not return exactly caller memberships';
  end if;
  if ctx->>'active_organization_id' is not null then
    raise exception 'M02 tenant API unexpectedly invented active tenant';
  end if;

  ctx:=public.dpp_api_tenant_context_set(org_a);
  if ctx->>'active_organization_id'<>org_a::text then
    raise exception 'M02 active tenant A was not persisted';
  end if;
  if not exists(
    select 1 from jsonb_array_elements(ctx->'memberships') x
    where x->>'organization_id'=org_a::text
      and x->>'role'='owner'
      and (x->>'active')::boolean is true
  ) then
    raise exception 'M02/M03 active owner membership missing from context';
  end if;

  ctx:=public.dpp_api_tenant_context_set(org_b);
  if ctx->>'active_organization_id'<>org_b::text then
    raise exception 'M02 multi-tenant switch to B failed';
  end if;
  if public.dpp_require_active_role(array['owner','admin'])<>org_b then
    raise exception 'M03 active admin role assertion failed after tenant switch';
  end if;

  perform set_config('request.jwt.claim.sub','a2828282-8282-4282-8282-828282828282',true);
  ctx:=public.dpp_api_tenant_context();
  if jsonb_array_length(ctx->'memberships')<>1 then
    raise exception 'M02 editor context leaked another tenant membership';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_tenant_context_set(org_b);
  exception when sqlstate 'DP102' then
    seen:=true;
  end;
  if not seen then
    raise exception 'M02 non-member tenant switch was not denied';
  end if;

  perform set_config('request.jwt.claim.sub','',true);
  seen:=false;
  begin
    perform public.dpp_api_tenant_context();
  exception when sqlstate 'DP101' then
    seen:=true;
  end;
  if not seen then
    raise exception 'M02 unauthenticated context did not fail closed';
  end if;
end
$matrix$;

select 'M02_M03_TENANT_API_SUBSET_PASS' as result;
