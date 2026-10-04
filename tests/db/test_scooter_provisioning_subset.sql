-- Stage 4 integration coverage: atomic/idempotent LMT single-item provisioning.
-- CI runs this file inside a transaction and rolls it back.

do $seed$
declare
  u_owner uuid := 'c1111111-1111-4111-8111-111111111111';
  u_viewer uuid := 'c2222222-2222-4222-8222-222222222222';
  u_other uuid := 'c3333333-3333-4333-8333-333333333333';
  org_a uuid := 'c4444444-4444-4444-8444-444444444444';
  org_b uuid := 'c5555555-5555-4555-8555-555555555555';
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
    insert into auth.users(id) values (u_owner),(u_viewer),(u_other);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'Stage4 Org A','stage4-org-a'),
    (org_b,'Stage4 Org B','stage4-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values
    ('c6666666-6666-4666-8666-666666666666',org_a,'S4-LMT-A','Stage4 Maker A','light_means_of_transport','{}'::jsonb),
    ('c7777777-7777-4777-8777-777777777777',org_a,'S4-EV-A','Stage4 Maker A','electric_vehicle','{}'::jsonb),
    ('c8888888-8888-4888-8888-888888888888',org_b,'S4-LMT-B','Stage4 Maker B','light_means_of_transport','{}'::jsonb);
end
$seed$;

do $stage4$
declare
  org_a uuid := 'c4444444-4444-4444-8444-444444444444';
  org_b uuid := 'c5555555-5555-4555-8555-555555555555';
  model_lmt_a uuid := 'c6666666-6666-4666-8666-666666666666';
  model_ev_a uuid := 'c7777777-7777-4777-8777-777777777777';
  model_lmt_b uuid := 'c8888888-8888-4888-8888-888888888888';
  first_result jsonb;
  retry_result jsonb;
  item_id uuid;
  passport_id uuid;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','c1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  first_result:=public.dpp_api_scooter_battery_provision(
    model_lmt_a,
    'urn:dpp:stage4:lmt:a:000001',
    '{"serial":"S4-A-000001"}'::jsonb,
    '{"model":{"identification":{"category":"light_means_of_transport","model_id":"S4-LMT-A","manufacturer":{"name":"Stage4 Maker A"}}},"item":{"unique_identifier":"urn:dpp:stage4:lmt:a:000001"}}'::jsonb,
    '{"item":{"state_of_health":{"percent":100}}}'::jsonb
  );

  item_id:=(first_result->>'item_id')::uuid;
  passport_id:=(first_result->>'passport_id')::uuid;

  if first_result->>'unique_identifier'<>'urn:dpp:stage4:lmt:a:000001' then
    raise exception 'Stage4 returned wrong unique identifier';
  end if;
  if first_result->>'lifecycle_status'<>'original' then
    raise exception 'Stage4 new battery lifecycle is not original';
  end if;
  if first_result->>'passport_status'<>'active' then
    raise exception 'Stage4 passport was not activated atomically';
  end if;
  if (first_result->>'created_item')::boolean is not true
     or (first_result->>'created_passport')::boolean is not true
     or (first_result->>'idempotent_replay')::boolean is not false then
    raise exception 'Stage4 first provisioning creation flags mismatch';
  end if;

  if (select count(*) from public.dpp_battery_items where id=item_id and organization_id=org_a)<>1 then
    raise exception 'Stage4 item row missing';
  end if;
  if (select count(*) from public.dpp_passports where id=passport_id and battery_item_id=item_id and status='active')<>1 then
    raise exception 'Stage4 active passport row missing';
  end if;

  if (public.dpp_api_passport_public('urn:dpp:stage4:lmt:a:000001')->>'passport_id')::uuid<>passport_id then
    raise exception 'Stage4 public passport does not resolve to provisioned passport';
  end if;

  -- Identical retry must return the same item/passport without duplicate rows.
  retry_result:=public.dpp_api_scooter_battery_provision(
    model_lmt_a,
    'urn:dpp:stage4:lmt:a:000001',
    '{"serial":"S4-A-000001"}'::jsonb,
    '{"model":{"identification":{"category":"light_means_of_transport","model_id":"S4-LMT-A","manufacturer":{"name":"Stage4 Maker A"}}},"item":{"unique_identifier":"urn:dpp:stage4:lmt:a:000001"}}'::jsonb,
    '{"item":{"state_of_health":{"percent":100}}}'::jsonb
  );
  if (retry_result->>'item_id')::uuid<>item_id
     or (retry_result->>'passport_id')::uuid<>passport_id
     or (retry_result->>'idempotent_replay')::boolean is not true then
    raise exception 'Stage4 identical retry was not idempotent';
  end if;
  if (select count(*) from public.dpp_battery_items where unique_identifier='urn:dpp:stage4:lmt:a:000001')<>1 then
    raise exception 'Stage4 retry duplicated battery item';
  end if;
  if (select count(*) from public.dpp_passports where battery_item_id=item_id)<>1 then
    raise exception 'Stage4 retry duplicated passport';
  end if;

  -- Divergent retry on the same identifier must fail closed.
  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_provision(
      model_lmt_a,
      'urn:dpp:stage4:lmt:a:000001',
      '{"serial":"DIFFERENT"}'::jsonb,
      '{"model":{"identification":{"category":"light_means_of_transport","model_id":"S4-LMT-A"}},"item":{"unique_identifier":"urn:dpp:stage4:lmt:a:000001"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP604' then seen:=true;
  end;
  if not seen then raise exception 'Stage4 divergent identifier retry was not rejected'; end if;

  -- Wrong category must fail before an item/passport is created.
  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_provision(
      model_ev_a,
      'urn:dpp:stage4:ev:forbidden',
      '{}'::jsonb,
      '{"model":{"identification":{"category":"light_means_of_transport"}},"item":{"unique_identifier":"urn:dpp:stage4:ev:forbidden"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP602' then seen:=true;
  end;
  if not seen then raise exception 'Stage4 non-LMT model was accepted'; end if;
  if exists(select 1 from public.dpp_battery_items where unique_identifier='urn:dpp:stage4:ev:forbidden') then
    raise exception 'Stage4 non-LMT failure left a partial item';
  end if;

  -- Public identifier mismatch must fail before writes.
  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_provision(
      model_lmt_a,
      'urn:dpp:stage4:lmt:a:mismatch',
      '{}'::jsonb,
      '{"item":{"unique_identifier":"urn:dpp:stage4:lmt:a:WRONG"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP603' then seen:=true;
  end;
  if not seen then raise exception 'Stage4 mismatched public identifier was accepted'; end if;
  if exists(select 1 from public.dpp_battery_items where unique_identifier='urn:dpp:stage4:lmt:a:mismatch') then
    raise exception 'Stage4 identifier mismatch left a partial item';
  end if;

  -- Restricted catalog fields must never be provisioned into public payload.
  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_provision(
      model_lmt_a,
      'urn:dpp:stage4:lmt:a:restricted',
      '{}'::jsonb,
      '{"model":{"restricted_composition":{"secret":"x"}},"item":{"unique_identifier":"urn:dpp:stage4:lmt:a:restricted"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP409' then seen:=true;
  end;
  if not seen then raise exception 'Stage4 restricted public payload was accepted'; end if;
  if exists(select 1 from public.dpp_battery_items where unique_identifier='urn:dpp:stage4:lmt:a:restricted') then
    raise exception 'Stage4 restricted payload failure left a partial item';
  end if;

  -- Viewer cannot provision.
  perform set_config('request.jwt.claim.sub','c2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_provision(
      model_lmt_a,
      'urn:dpp:stage4:lmt:a:viewer',
      '{}'::jsonb,
      '{"item":{"unique_identifier":"urn:dpp:stage4:lmt:a:viewer"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'Stage4 viewer provisioning was not denied'; end if;

  -- Global identifier cannot be claimed by another tenant.
  perform set_config('request.jwt.claim.sub','c3333333-3333-4333-8333-333333333333',true);
  perform public.dpp_set_active_organization(org_b);
  seen:=false;
  begin
    perform public.dpp_api_scooter_battery_provision(
      model_lmt_b,
      'urn:dpp:stage4:lmt:a:000001',
      '{"serial":"OTHER-TENANT"}'::jsonb,
      '{"item":{"unique_identifier":"urn:dpp:stage4:lmt:a:000001"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP604' then seen:=true;
  end;
  if not seen then raise exception 'Stage4 cross-tenant global identifier collision was not rejected'; end if;

  if has_function_privilege('anon','public.dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'Stage4 provisioning RPC leaked anon EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'Stage4 provisioning RPC missing authenticated EXECUTE';
  end if;
end
$stage4$;

select 'STAGE4_SINGLE_ITEM_PROVISIONING_PASS' as result;
