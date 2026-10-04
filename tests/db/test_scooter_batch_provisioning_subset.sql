-- Stage 5 integration coverage: atomic/idempotent Produce-X LMT batch provisioning.
-- CI executes this file inside a transaction and rolls it back.

do $seed$
declare
  u_owner uuid := 'd1111111-1111-4111-8111-111111111111';
  u_viewer uuid := 'd2222222-2222-4222-8222-222222222222';
  org_a uuid := 'd3333333-3333-4333-8333-333333333333';
  model_a uuid := 'd4444444-4444-4444-8444-444444444444';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_viewer
    );
  else
    insert into auth.users(id) values (u_owner),(u_viewer);
  end if;

  insert into public.dpp_organizations(id,name,slug)
  values (org_a,'Stage5 Org A','stage5-org-a');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_viewer,'viewer');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values (
    model_a,org_a,'S5-LMT-A','Stage5 Maker A','light_means_of_transport','{}'::jsonb
  );
end
$seed$;

do $stage5$
declare
  org_a uuid := 'd3333333-3333-4333-8333-333333333333';
  model_a uuid := 'd4444444-4444-4444-8444-444444444444';
  units jsonb;
  bad_units jsonb;
  first_result jsonb;
  retry_result jsonb;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','d1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  bad_units:=jsonb_build_array(
    jsonb_build_object(
      'unique_identifier','urn:dpp:stage5:rollback:000001',
      'item_canonical_data',jsonb_build_object('production',jsonb_build_object('batch_key','S5-ROLLBACK')),
      'public_payload',jsonb_build_object('item',jsonb_build_object('unique_identifier','urn:dpp:stage5:rollback:000001')),
      'private_payload','{}'::jsonb
    ),
    jsonb_build_object(
      'unique_identifier','urn:dpp:stage5:rollback:000002',
      'item_canonical_data','{}'::jsonb,
      'public_payload',jsonb_build_object('item',jsonb_build_object('unique_identifier','WRONG-ID')),
      'private_payload','{}'::jsonb
    )
  );

  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_batch_provision(model_a,'S5-ROLLBACK',bad_units);
  exception when sqlstate 'DP603' then seen:=true;
  end;
  if not seen then
    raise exception 'Stage5 invalid second unit did not fail the batch';
  end if;
  if exists(select 1 from public.dpp_battery_items where unique_identifier like 'urn:dpp:stage5:rollback:%') then
    raise exception 'Stage5 failed batch left a partial battery item';
  end if;
  if exists(select 1 from public.dpp_provision_batches where organization_id=org_a and batch_key='S5-ROLLBACK') then
    raise exception 'Stage5 failed batch left a partial batch row';
  end if;

  units:=jsonb_build_array(
    jsonb_build_object(
      'unique_identifier','urn:dpp:stage5:lmt:a:000001',
      'item_canonical_data','{"production":{"batch_key":"S5-A","serial_number":"000001"}}'::jsonb,
      'public_payload','{"model":{"identification":{"category":"light_means_of_transport"}},"item":{"unique_identifier":"urn:dpp:stage5:lmt:a:000001"}}'::jsonb,
      'private_payload','{}'::jsonb
    ),
    jsonb_build_object(
      'unique_identifier','urn:dpp:stage5:lmt:a:000002',
      'item_canonical_data','{"production":{"batch_key":"S5-A","serial_number":"000002"}}'::jsonb,
      'public_payload','{"model":{"identification":{"category":"light_means_of_transport"}},"item":{"unique_identifier":"urn:dpp:stage5:lmt:a:000002"}}'::jsonb,
      'private_payload','{}'::jsonb
    ),
    jsonb_build_object(
      'unique_identifier','urn:dpp:stage5:lmt:a:000003',
      'item_canonical_data','{"production":{"batch_key":"S5-A","serial_number":"000003"}}'::jsonb,
      'public_payload','{"model":{"identification":{"category":"light_means_of_transport"}},"item":{"unique_identifier":"urn:dpp:stage5:lmt:a:000003"}}'::jsonb,
      'private_payload','{}'::jsonb
    )
  );

  first_result:=public.dpp_api_scooter_battery_batch_provision(model_a,'S5-A',units);
  if (first_result->>'quantity')::integer<>3
     or (first_result->>'created_batch')::boolean is not true
     or (first_result->>'idempotent_replay')::boolean is not false then
    raise exception 'Stage5 first batch result flags mismatch';
  end if;
  if jsonb_array_length(first_result->'units')<>3 then
    raise exception 'Stage5 batch did not return three provisioned units';
  end if;
  if (select count(*) from public.dpp_provision_batches where organization_id=org_a and batch_key='S5-A')<>1 then
    raise exception 'Stage5 durable batch row missing';
  end if;
  if (
    select count(*)
    from public.dpp_provision_batch_items x
    join public.dpp_provision_batches b on b.id=x.batch_id
    where b.organization_id=org_a and b.batch_key='S5-A'
  )<>3 then
    raise exception 'Stage5 durable batch membership count mismatch';
  end if;
  if (select count(*) from public.dpp_battery_items where unique_identifier like 'urn:dpp:stage5:lmt:a:%')<>3 then
    raise exception 'Stage5 did not create exactly three physical items';
  end if;
  if (
    select count(*)
    from public.dpp_passports p
    join public.dpp_battery_items i on i.id=p.battery_item_id
    where i.unique_identifier like 'urn:dpp:stage5:lmt:a:%' and p.status='draft'
  )<>3 then
    raise exception 'Step18 batch provisioning did not create exactly three draft passports';
  end if;

  retry_result:=public.dpp_api_scooter_battery_batch_provision(model_a,'S5-A',units);
  if (retry_result->>'created_batch')::boolean is not false
     or (retry_result->>'idempotent_replay')::boolean is not true
     or (retry_result->>'batch_id')<>(first_result->>'batch_id') then
    raise exception 'Stage5 identical batch retry was not idempotent';
  end if;
  if (select count(*) from public.dpp_battery_items where unique_identifier like 'urn:dpp:stage5:lmt:a:%')<>3 then
    raise exception 'Stage5 retry duplicated physical items';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_batch_provision(
      model_a,'S5-A',
      jsonb_set(units,'{0,item_canonical_data,changed}','true'::jsonb,true)
    );
  exception when sqlstate 'DP606' then seen:=true;
  end;
  if not seen then
    raise exception 'Stage5 divergent retry reused the same batch key';
  end if;

  perform set_config('request.jwt.claim.sub','d2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_batch_provision(model_a,'S5-VIEWER',units);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then
    raise exception 'Stage5 viewer batch provisioning was not denied';
  end if;

  if has_function_privilege('anon','public.dpp_api_scooter_battery_batch_provision(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Stage5 batch provisioning RPC leaked anon EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_scooter_battery_batch_provision(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Stage5 batch provisioning RPC missing authenticated EXECUTE';
  end if;
end
$stage5$;

select 'STAGE5_BATCH_PROVISIONING_PASS' as result;
