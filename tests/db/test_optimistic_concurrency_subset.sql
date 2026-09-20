-- M23 optimistic concurrency regression.
-- Caller must wrap this file in a rollback transaction.

do $m23$
declare
  u_editor uuid := 'e1818181-8181-4181-8181-818181818181';
  org_a uuid := 'e2828282-8282-4282-8282-828282828282';
  model_a uuid := 'e3838383-8383-4383-8383-838383838383';
  model_delete uuid := 'e5858585-8585-4585-8585-858585858585';
  item_a uuid := 'e4848484-8484-4484-8484-848484848484';
  passport_a uuid;
  model_ts timestamptz;
  item_ts timestamptz;
  passport_ts timestamptz;
  payload jsonb;
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
  values(org_a,'M23 OCC Org','m23-occ-org');
  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(org_a,u_editor,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(model_a,org_a,'M23-OCC','Maker A','portable','{}'::jsonb)
  returning updated_at into model_ts;

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(model_delete,org_a,'M23-DELETE','Maker Delete','portable','{}'::jsonb);

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data
  ) values(item_a,org_a,model_a,'urn:dpp:m23:occ','original','{}'::jsonb)
  returning updated_at into item_ts;

  perform set_config('request.jwt.claim.sub',u_editor::text,true);
  perform public.dpp_api_tenant_context_set(org_a);

  payload:=public.dpp_api_passport_create(
    item_a,
    jsonb_build_object('item',jsonb_build_object('unique_identifier','urn:dpp:m23:occ')),
    '{}'::jsonb
  );
  passport_a:=(payload->>'passport_id')::uuid;
  passport_ts:=(payload->>'updated_at')::timestamptz;

  -- First writes using the fresh precondition must succeed.
  payload:=public.dpp_api_models_update_checked(
    model_a,'M23-OCC-2',null,null,null,model_ts
  );
  if payload->>'model_identifier'<>'M23-OCC-2' then
    raise exception 'M23 checked model update failed';
  end if;

  payload:=public.dpp_api_items_update_checked(
    item_a,null,null,'repurposed',null,item_ts
  );
  if payload->>'lifecycle_status'<>'repurposed' then
    raise exception 'M23 checked item update failed';
  end if;

  payload:=public.dpp_api_passport_update_checked(
    passport_a,'active',null,null,passport_ts
  );
  if payload->>'status'<>'active' then
    raise exception 'M23 checked passport update failed';
  end if;

  -- Reusing the original timestamps simulates a second stale writer and must fail.
  seen:=false;
  begin
    perform public.dpp_api_models_update_checked(model_a,'LOST-UPDATE',null,null,null,model_ts);
  exception when sqlstate 'DP206' then seen:=true;
  end;
  if not seen then raise exception 'M23 stale model write was not rejected'; end if;

  seen:=false;
  begin
    perform public.dpp_api_items_update_checked(item_a,null,null,'retired',null,item_ts);
  exception when sqlstate 'DP309' then seen:=true;
  end;
  if not seen then raise exception 'M23 stale item write was not rejected'; end if;

  seen:=false;
  begin
    perform public.dpp_api_passport_update_checked(passport_a,'suspended',null,null,passport_ts);
  exception when sqlstate 'DP411' then seen:=true;
  end;
  if not seen then raise exception 'M23 stale passport write was not rejected'; end if;

  -- Model delete must also be protected by the same observed updated_at token.
  select updated_at into model_ts
  from public.dpp_battery_models
  where id=model_delete;

  perform public.dpp_api_models_update_checked(
    model_delete,'M23-DELETE-2',null,null,null,model_ts
  );

  seen:=false;
  begin
    perform public.dpp_api_models_delete_checked(model_delete,model_ts);
  exception when sqlstate 'DP206' then seen:=true;
  end;
  if not seen then raise exception 'M23 stale model delete was not rejected'; end if;

  select updated_at into model_ts
  from public.dpp_battery_models
  where id=model_delete;

  if public.dpp_api_models_delete_checked(model_delete,model_ts)<>model_delete then
    raise exception 'M23 checked model delete failed';
  end if;

  -- Authenticated clients must not retain execute on unchecked updates/deletes.
  if has_function_privilege('authenticated','public.dpp_api_models_update(uuid,text,text,text,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.dpp_api_models_delete(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.dpp_api_items_update(uuid,uuid,text,text,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.dpp_api_passport_update(uuid,text,jsonb,jsonb)','EXECUTE') then
    raise exception 'M23 unchecked update/delete RPC remains executable by authenticated';
  end if;

  if not has_function_privilege('authenticated','public.dpp_api_models_update_checked(uuid,text,text,text,jsonb,timestamptz)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_models_delete_checked(uuid,timestamptz)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_items_update_checked(uuid,uuid,text,text,jsonb,timestamptz)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_passport_update_checked(uuid,text,jsonb,jsonb,timestamptz)','EXECUTE') then
    raise exception 'M23 checked update RPC execute grant missing';
  end if;
end
$m23$;

select 'M23_OPTIMISTIC_CONCURRENCY_PASS' as result;
