-- Physical QR/NFC carrier integration subset.
-- CI replays all migrations before this file and wraps test state in a transaction.

do $seed$
declare
  u_owner uuid := 'c1111111-1111-4111-8111-111111111111';
  u_viewer uuid := 'c2222222-2222-4222-8222-222222222222';
  org_id uuid := 'c3333333-3333-4333-8333-333333333333';
  model_id uuid := 'c4444444-4444-4444-8444-444444444444';
  item_id uuid := 'c5555555-5555-4555-8555-555555555555';
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
  values (org_id,'Physical Carrier Test','physical-carrier-test');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_id,u_owner,'owner'),
    (org_id,u_viewer,'viewer');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values (
    model_id,org_id,'CARRIER-MODEL-1','Carrier Maker','industrial','{}'::jsonb
  );

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by
  ) values (
    item_id,org_id,model_id,'BAT-CARRIER-0001','original',
    '{"serial_number":"CARRIER-SERIAL-1"}'::jsonb,u_owner
  );

  insert into public.dpp_passports(
    organization_id,battery_item_id,status,public_payload,private_payload,created_by
  ) values (
    org_id,item_id,'active',
    '{"manufacturer":"Carrier Maker","model":"CARRIER-MODEL-1","capacity_ah":60}'::jsonb,
    '{}'::jsonb,u_owner
  );
end
$seed$;

do $test$
declare
  org_id uuid := 'c3333333-3333-4333-8333-333333333333';
  item_id uuid := 'c5555555-5555-4555-8555-555555555555';
  qr jsonb;
  nfc jsonb;
  opened jsonb;
  event_carrier uuid;
  event_source text;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','c1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_id);

  qr:=public.dpp_api_carrier_bind(
    item_id,'qr','https://dpp.example/demo/carrier-passport.html?id=BAT-CARRIER-0001',null,null
  );
  if qr->>'carrier_kind'<>'qr' or qr->>'status'<>'active' then
    raise exception 'QR carrier bind failed';
  end if;

  nfc:=public.dpp_api_carrier_bind(
    item_id,'nfc','https://dpp.example/demo/carrier-passport.html?id=BAT-CARRIER-0001','ntag215',null
  );
  if nfc->>'carrier_kind'<>'nfc' or nfc->>'nfc_technology'<>'ntag215' then
    raise exception 'NTAG215 carrier bind failed';
  end if;

  if jsonb_array_length(public.dpp_api_carriers_list(item_id))<>2 then
    raise exception 'carrier list did not return both active carriers';
  end if;

  -- Viewer may inspect carrier bindings but cannot provision or replace them.
  perform set_config('request.jwt.claim.sub','c2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_id);
  if jsonb_array_length(public.dpp_api_carriers_list(item_id))<>2 then
    raise exception 'viewer cannot read carrier bindings';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_carrier_bind(
      item_id,'nfc','https://dpp.example/demo/carrier-passport.html?id=BAT-CARRIER-0001','ntag215',null
    );
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'viewer was allowed to provision NFC'; end if;

  -- The exact same QR/NFC URL means the landing page must not guess source.
  perform set_config('request.jwt.claim.sub','',true);
  opened:=public.dpp_api_carrier_open('BAT-CARRIER-0001','unknown');
  if opened->>'unique_identifier'<>'BAT-CARRIER-0001' then
    raise exception 'public carrier open returned wrong battery';
  end if;
  if opened->'public_payload'->>'capacity_ah'<>'60' then
    raise exception 'public carrier open returned wrong live payload';
  end if;

  select e.carrier_id,e.source
  into event_carrier,event_source
  from public.dpp_carrier_scan_events e
  where e.organization_id=org_id and e.battery_item_id=item_id
  order by e.id desc
  limit 1;

  if event_source<>'unknown' then
    raise exception 'same URL scan source was falsely attributed';
  end if;
  if event_carrier is not null then
    raise exception 'same URL scan was falsely bound to a specific physical carrier';
  end if;

  -- Owner can replace an NFC carrier while preserving the battery/passport.
  perform set_config('request.jwt.claim.sub','c1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_id);
  perform public.dpp_api_carrier_bind(
    item_id,'nfc','https://dpp.example/demo/carrier-passport.html?id=BAT-CARRIER-0001','ntag215','replacement-metadata'
  );
  if (
    select count(*) from public.dpp_physical_carriers c
    where c.organization_id=org_id and c.battery_item_id=item_id
      and c.carrier_kind='nfc' and c.status='active'
  )<>1 then
    raise exception 'NFC replace did not preserve one active carrier';
  end if;
  if (
    select count(*) from public.dpp_physical_carriers c
    where c.organization_id=org_id and c.battery_item_id=item_id
      and c.carrier_kind='nfc' and c.status='replaced'
  )<>1 then
    raise exception 'previous NFC carrier was not retained as replaced history';
  end if;
end
$test$;

select 'PHYSICAL_CARRIERS_SUBSET_PASS' as result;
