-- M10/M19 bound runtime public/private enforcement matrix.
-- Caller must wrap this file in a rollback transaction.

do $m10$
declare
  u_editor uuid := 'd1818181-8181-4181-8181-818181818181';
  org_a uuid := 'd2828282-8282-4282-8282-828282828282';
  model_a uuid := 'd3838383-8383-4383-8383-838383838383';
  item_a uuid := 'd4848484-8484-4484-8484-848484848484';
  ident text := 'urn:dpp:m10:runtime:1';
  created jsonb;
  public_view jsonb;
  private_view jsonb;
  passport_id uuid;
  seen boolean;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false)',
      u_editor
    );
  else
    insert into auth.users(id) values (u_editor);
  end if;

  insert into public.dpp_organizations(id,name,slug)
  values(org_a,'M10 Runtime Org','m10-runtime-org');

  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(org_a,u_editor,'editor');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(
    model_a,org_a,'M10-RUNTIME','M10 Maker','electric_vehicle','{}'::jsonb
  );

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data
  ) values(
    item_a,org_a,model_a,ident,'original','{}'::jsonb
  );

  perform set_config('request.jwt.claim.sub',u_editor::text,true);
  perform public.dpp_api_tenant_context_set(org_a);

  created:=public.dpp_api_passport_create(
    item_a,
    jsonb_build_object(
      'model',jsonb_build_object(
        'identification',jsonb_build_object(
          'manufacturer',jsonb_build_object('name','M10 Maker'),
          'category','electric_vehicle',
          'model_id','M10-RUNTIME'
        )
      ),
      'item',jsonb_build_object('unique_identifier',ident)
    ),
    jsonb_build_object(
      'state_of_health',91,
      'secret_marker','M10_PRIVATE_SECRET'
    )
  );

  passport_id:=(created->>'passport_id')::uuid;

  perform public.dpp_api_passport_update(passport_id,'active',null,null);

  seen:=false;
  begin
    perform public.dpp_api_passport_update(
      passport_id,
      null,
      jsonb_build_object(
        'model',jsonb_build_object(),
        'item',jsonb_build_object(
          'unique_identifier',ident,
          'state_of_health',91
        )
      ),
      null
    );
  exception when sqlstate 'DP409' then
    seen:=true;
  end;
  if not seen then
    raise exception 'M10 restricted item field was accepted into public payload';
  end if;

  public_view:=public.dpp_api_passport_public(ident);
  if public_view ? 'private_payload' then
    raise exception 'M10 public RPC exposed private_payload key';
  end if;
  if public_view::text like '%M10_PRIVATE_SECRET%' then
    raise exception 'M10 public RPC leaked private payload value';
  end if;
  if public_view->'public_payload'->'item'->>'unique_identifier'<>ident then
    raise exception 'M10 public identifier missing or altered';
  end if;

  private_view:=public.dpp_api_passport_private(passport_id);
  if private_view->'private_payload'->>'secret_marker'<>'M10_PRIVATE_SECRET' then
    raise exception 'M10 authenticated private RPC lost private payload';
  end if;

  if not has_function_privilege('anon','public.dpp_api_passport_public(text)','EXECUTE') then
    raise exception 'M10 anon public RPC execute missing';
  end if;
  if has_function_privilege('anon','public.dpp_api_passport_private(uuid)','EXECUTE') then
    raise exception 'M10 anon unexpectedly has private RPC execute';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_passport_private(uuid)','EXECUTE') then
    raise exception 'M10 authenticated private RPC execute missing';
  end if;
end
$m10$;

select 'M10_PUBLIC_PRIVATE_RUNTIME_PASS' as result;
