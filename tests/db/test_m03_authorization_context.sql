-- M03 authorization-context runtime matrix. Caller wraps in BEGIN/ROLLBACK.
do $test$
declare
  u_owner uuid := 'd1818181-8181-4181-8181-818181818181';
  u_admin uuid := 'd2828282-8282-4282-8282-828282828282';
  u_editor uuid := 'd3838383-8383-4383-8383-838383838383';
  u_viewer uuid := 'd4848484-8484-4484-8484-848484848484';
  org_id uuid;
  j jsonb;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_admin,u_editor,u_viewer
    );
  else
    insert into auth.users(id) values (u_owner),(u_admin),(u_editor),(u_viewer);
  end if;

  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  j:=public.dpp_api_organization_create('M03 Context Org','m03-context-org');
  org_id:=(j->>'organization_id')::uuid;
  perform public.dpp_api_members_add(u_admin,'admin');
  perform public.dpp_api_members_add(u_editor,'editor');
  perform public.dpp_api_members_add(u_viewer,'viewer');

  j:=public.dpp_api_authorization_context();
  if j->>'role'<>'owner' or (j#>>'{capabilities,admin_manage}')::boolean is not true then
    raise exception 'owner authorization context mismatch';
  end if;

  perform set_config('request.jwt.claim.sub',u_admin::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  j:=public.dpp_api_authorization_context();
  if j->>'role'<>'admin'
     or (j#>>'{capabilities,members_manage}')::boolean is not true
     or (j#>>'{capabilities,admin_manage}')::boolean is not false then
    raise exception 'admin authorization context mismatch';
  end if;

  perform set_config('request.jwt.claim.sub',u_editor::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  j:=public.dpp_api_authorization_context();
  if j->>'role'<>'editor'
     or (j#>>'{capabilities,members_manage}')::boolean is not false
     or (j#>>'{capabilities,records_write}')::boolean is not true then
    raise exception 'editor authorization context mismatch';
  end if;

  perform set_config('request.jwt.claim.sub',u_viewer::text,true);
  perform public.dpp_api_tenant_context_set(org_id);
  j:=public.dpp_api_authorization_context();
  if j->>'role'<>'viewer'
     or (j#>>'{capabilities,members_manage}')::boolean is not false
     or (j#>>'{capabilities,records_write}')::boolean is not false
     or (j#>>'{capabilities,private_read}')::boolean is not true then
    raise exception 'viewer authorization context mismatch';
  end if;
end
$test$;

select 'M03_AUTHORIZATION_CONTEXT_PASS' as result;