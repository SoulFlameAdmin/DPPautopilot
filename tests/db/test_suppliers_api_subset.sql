-- BAT51/BAT53/BAT54/BAT57/BAT60 manufacturer Supplier Network RPC acceptance.
do $seed$
declare
  u_owner uuid := '61000000-0000-4000-8000-000000000001';
  u_viewer uuid := '61000000-0000-4000-8000-000000000002';
  u_other uuid := '61000000-0000-4000-8000-000000000003';
  org_a uuid := '62000000-0000-4000-8000-000000000001';
  org_b uuid := '62000000-0000-4000-8000-000000000002';
  model_a uuid := '63000000-0000-4000-8000-000000000001';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_viewer,u_other
    );
  else
    insert into auth.users(id) values(u_owner),(u_viewer),(u_other);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'Supplier API Org A','supplier-api-org-a'),
    (org_b,'Supplier API Org B','supplier-api-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category
  ) values(
    model_a,org_a,'SUP-API-MODEL','Supplier API Maker','industrial'
  );
end
$seed$;

do $bat_supplier_api$
declare
  u_owner uuid := '61000000-0000-4000-8000-000000000001';
  u_viewer uuid := '61000000-0000-4000-8000-000000000002';
  u_other uuid := '61000000-0000-4000-8000-000000000003';
  org_a uuid := '62000000-0000-4000-8000-000000000001';
  org_b uuid := '62000000-0000-4000-8000-000000000002';
  model_a uuid := '63000000-0000-4000-8000-000000000001';
  v_supplier jsonb;
  v_package jsonb;
  v_verify jsonb;
  v_list jsonb;
  v_supplier_id uuid;
  v_package_id uuid;
  denied boolean := false;
  hidden boolean := false;
begin
  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  perform public.dpp_set_active_organization(org_a);

  v_supplier:=public.dpp_api_supplier_create('CELLCO','Cell Company GmbH');
  v_supplier_id:=(v_supplier->>'id')::uuid;

  if v_supplier->>'legal_name'<>'Cell Company GmbH' then
    raise exception 'supplier create result mismatch';
  end if;

  v_package:=public.dpp_api_supplier_package_create(
    v_supplier_id,'component','cell:21700',model_a,null,'CELL-21700',null,
    '{"chemistry":"NMC","country_of_origin":"DE"}'::jsonb,
    '2026-10-02T00:00:00Z',null
  );
  v_package_id:=(v_package->>'id')::uuid;

  if v_package->>'component_ref'<>'CELL-21700' then
    raise exception 'supplier package exact scope mismatch';
  end if;

  v_verify:=public.dpp_api_supplier_package_verify(
    v_package_id,'verified','supplier-evidence:test','accepted supplier evidence'
  );
  if v_verify->>'status'<>'verified' then
    raise exception 'supplier package verification result mismatch';
  end if;

  v_list:=public.dpp_api_suppliers_list();
  if jsonb_array_length(v_list)<>1 then
    raise exception 'supplier list expected one row';
  end if;
  if (v_list->0->>'package_count')::integer<>1 then
    raise exception 'supplier list package count mismatch';
  end if;

  perform set_config('request.jwt.claim.sub',u_viewer::text,true);
  perform public.dpp_set_active_organization(org_a);
  v_list:=public.dpp_api_suppliers_list();
  if jsonb_array_length(v_list)<>1 then
    raise exception 'viewer supplier list should remain readable';
  end if;

  begin
    perform public.dpp_api_supplier_create('VIEWER-NO','Should Fail');
  exception when sqlstate 'DP104' then
    denied:=true;
  end;
  if not denied then
    raise exception 'viewer unexpectedly created supplier';
  end if;

  perform set_config('request.jwt.claim.sub',u_other::text,true);
  perform public.dpp_set_active_organization(org_b);
  v_list:=public.dpp_api_suppliers_list();
  if v_list<>'[]'::jsonb then
    raise exception 'cross-tenant supplier list leaked records';
  end if;

  begin
    perform public.dpp_api_supplier_package_verify(
      v_package_id,'verified','evidence:x',null
    );
  exception when sqlstate 'DP604' then
    hidden:=true;
  end;
  if not hidden then
    raise exception 'cross-tenant package verification did not hide package';
  end if;
end
$bat_supplier_api$;

select 'BAT_SUPPLIERS_API_DB_PASS' as result;
