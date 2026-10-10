-- Manufacturer Pilot V1 generic category provisioning acceptance.
-- CI wraps this file in BEGIN/ROLLBACK.

do $seed$
declare
  owner_id uuid := 'd1111111-1111-4111-8111-111111111111';
  viewer_id uuid := 'd2222222-2222-4222-8222-222222222222';
  other_id uuid := 'd3333333-3333-4333-8333-333333333333';
  org_a uuid := 'd4444444-4444-4444-8444-444444444444';
  org_b uuid := 'd5555555-5555-4555-8555-555555555555';
begin
  insert into auth.users(id) values (owner_id),(viewer_id),(other_id);
  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'Generic Battery Org A','generic-battery-org-a'),
    (org_b,'Generic Battery Org B','generic-battery-org-b');
  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,owner_id,'owner'),
    (org_a,viewer_id,'viewer'),
    (org_b,other_id,'owner');
  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values
    ('d6666666-6666-4666-8666-666666666666',org_a,'GEN-IND-001','Generic Maker','industrial','{}'::jsonb),
    ('d7777777-7777-4777-8777-777777777777',org_b,'GEN-EV-001','Other Maker','electric_vehicle','{}'::jsonb);
end
$seed$;

do $generic$
declare
  org_a uuid := 'd4444444-4444-4444-8444-444444444444';
  org_b uuid := 'd5555555-5555-4555-8555-555555555555';
  model_a uuid := 'd6666666-6666-4666-8666-666666666666';
  model_b uuid := 'd7777777-7777-4777-8777-777777777777';
  one jsonb;
  batch jsonb;
  replay jsonb;
  denied boolean;
begin
  perform set_config('request.jwt.claim.sub','d1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  one:=public.dpp_api_battery_provision(
    model_a,
    'urn:dpp:generic:industrial:000001',
    '{"serial":"IND-000001"}'::jsonb,
    '{"model":{"identification":{"category":"industrial","model_id":"GEN-IND-001","manufacturer":{"name":"Generic Maker"}}},"item":{"unique_identifier":"urn:dpp:generic:industrial:000001"}}'::jsonb,
    '{}'::jsonb
  );
  if one->>'passport_status'<>'draft'
     or one->>'unique_identifier'<>'urn:dpp:generic:industrial:000001'
     or (one->>'activation_required')::boolean is not true then
    raise exception 'Generic single-item provisioning returned invalid state';
  end if;

  replay:=public.dpp_api_battery_provision(
    model_a,
    'urn:dpp:generic:industrial:000001',
    '{"serial":"IND-000001"}'::jsonb,
    '{"model":{"identification":{"category":"industrial","model_id":"GEN-IND-001","manufacturer":{"name":"Generic Maker"}}},"item":{"unique_identifier":"urn:dpp:generic:industrial:000001"}}'::jsonb,
    '{}'::jsonb
  );
  if (replay->>'idempotent_replay')::boolean is not true
     or replay->>'item_id'<>one->>'item_id'
     or replay->>'passport_id'<>one->>'passport_id' then
    raise exception 'Generic single-item retry was not idempotent';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_battery_provision(
      model_a,
      'urn:dpp:generic:industrial:mismatch',
      '{}'::jsonb,
      '{"model":{"identification":{"category":"portable"}},"item":{"unique_identifier":"urn:dpp:generic:industrial:mismatch"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP603' then denied:=true;
  end;
  if not denied then raise exception 'Generic provisioning accepted category mismatch'; end if;

  batch:=public.dpp_api_battery_batch_provision(
    model_a,
    'GEN-BATCH-001',
    jsonb_build_array(
      jsonb_build_object(
        'unique_identifier','urn:dpp:generic:industrial:000002',
        'item_canonical_data',jsonb_build_object('production',jsonb_build_object('batch_key','GEN-BATCH-001','serial_number','000002')),
        'public_payload',jsonb_build_object(
          'model',jsonb_build_object('identification',jsonb_build_object('category','industrial','model_id','GEN-IND-001','manufacturer',jsonb_build_object('name','Generic Maker'))),
          'item',jsonb_build_object('unique_identifier','urn:dpp:generic:industrial:000002')
        ),
        'private_payload','{}'::jsonb
      ),
      jsonb_build_object(
        'unique_identifier','urn:dpp:generic:industrial:000003',
        'item_canonical_data',jsonb_build_object('production',jsonb_build_object('batch_key','GEN-BATCH-001','serial_number','000003')),
        'public_payload',jsonb_build_object(
          'model',jsonb_build_object('identification',jsonb_build_object('category','industrial','model_id','GEN-IND-001','manufacturer',jsonb_build_object('name','Generic Maker'))),
          'item',jsonb_build_object('unique_identifier','urn:dpp:generic:industrial:000003')
        ),
        'private_payload','{}'::jsonb
      )
    )
  );
  if (batch->>'quantity')::integer<>2
     or jsonb_array_length(batch->'units')<>2
     or batch->'units'->0->>'passport_status'<>'draft'
     or batch->'units'->1->>'passport_status'<>'draft' then
    raise exception 'Generic batch provisioning did not create two draft passports';
  end if;

  replay:=public.dpp_api_battery_batch_provision(
    model_a,
    'GEN-BATCH-001',
    jsonb_build_array(
      jsonb_build_object(
        'unique_identifier','urn:dpp:generic:industrial:000002',
        'item_canonical_data',jsonb_build_object('production',jsonb_build_object('batch_key','GEN-BATCH-001','serial_number','000002')),
        'public_payload',jsonb_build_object(
          'model',jsonb_build_object('identification',jsonb_build_object('category','industrial','model_id','GEN-IND-001','manufacturer',jsonb_build_object('name','Generic Maker'))),
          'item',jsonb_build_object('unique_identifier','urn:dpp:generic:industrial:000002')
        ),
        'private_payload','{}'::jsonb
      ),
      jsonb_build_object(
        'unique_identifier','urn:dpp:generic:industrial:000003',
        'item_canonical_data',jsonb_build_object('production',jsonb_build_object('batch_key','GEN-BATCH-001','serial_number','000003')),
        'public_payload',jsonb_build_object(
          'model',jsonb_build_object('identification',jsonb_build_object('category','industrial','model_id','GEN-IND-001','manufacturer',jsonb_build_object('name','Generic Maker'))),
          'item',jsonb_build_object('unique_identifier','urn:dpp:generic:industrial:000003')
        ),
        'private_payload','{}'::jsonb
      )
    )
  );
  if (replay->>'idempotent_replay')::boolean is not true then
    raise exception 'Generic batch retry was not idempotent';
  end if;

  perform set_config('request.jwt.claim.sub','d2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  denied:=false;
  begin
    perform public.dpp_api_battery_provision(
      model_a,'urn:dpp:generic:viewer','{}'::jsonb,
      '{"item":{"unique_identifier":"urn:dpp:generic:viewer"}}'::jsonb,'{}'::jsonb
    );
  exception when sqlstate 'DP104' then denied:=true;
  end;
  if not denied then raise exception 'Viewer gained generic provisioning write access'; end if;

  perform set_config('request.jwt.claim.sub','d3333333-3333-4333-8333-333333333333',true);
  perform public.dpp_set_active_organization(org_b);
  denied:=false;
  begin
    perform public.dpp_api_battery_provision(
      model_a,'urn:dpp:generic:cross-tenant','{}'::jsonb,
      '{"item":{"unique_identifier":"urn:dpp:generic:cross-tenant"}}'::jsonb,'{}'::jsonb
    );
  exception when sqlstate 'DP601' then denied:=true;
  end;
  if not denied then raise exception 'Cross-tenant model id was accepted by generic provisioning'; end if;

  if has_function_privilege('anon','public.dpp_api_battery_provision(uuid,text,jsonb,jsonb,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.dpp_api_battery_batch_provision(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Generic provisioning RPC leaked anon EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_battery_provision(uuid,text,jsonb,jsonb,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_battery_batch_provision(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Generic provisioning RPC missing authenticated EXECUTE';
  end if;

  -- Legacy LMT RPC remains intentionally strict for compatibility.
  perform set_config('request.jwt.claim.sub','d1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);
  denied:=false;
  begin
    perform public.dpp_api_scooter_battery_provision(
      model_a,'urn:dpp:legacy:lmt:industrial','{}'::jsonb,
      '{"item":{"unique_identifier":"urn:dpp:legacy:lmt:industrial"}}'::jsonb,'{}'::jsonb
    );
  exception when sqlstate 'DP602' then denied:=true;
  end;
  if not denied then raise exception 'Legacy scooter RPC stopped enforcing LMT compatibility'; end if;
end
$generic$;

select 'GENERIC_BATTERY_PROVISIONING_PASS' as result;
