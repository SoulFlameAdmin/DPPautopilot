-- Manufacturer Pilot V1: non-LMT generic DRAFT passport -> ACTIVE technical pilot.
-- CI wraps this file in BEGIN/ROLLBACK.

do $test$
declare
  owner_id uuid := 'e1111111-1111-4111-8111-111111111111';
  org_id uuid := 'e2222222-2222-4222-8222-222222222222';
  model_id uuid := 'e3333333-3333-4333-8333-333333333333';
  provisioned jsonb;
  published jsonb;
  replay jsonb;
  public_row jsonb;
  v_passport_id uuid;
  versions_before integer;
  versions_after integer;
  denied boolean;
  payload jsonb := '{
    "model":{"identification":{"category":"industrial","model_id":"TP-IND-001","manufacturer":{"name":"Pilot Maker"}}},
    "item":{"unique_identifier":"urn:dpp:technical-pilot:draft:000001"}
  }'::jsonb;
begin
  insert into auth.users(id) values(owner_id);
  insert into public.dpp_organizations(id,name,slug)
  values(org_id,'Technical Pilot Draft Org','technical-pilot-draft-org');
  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(org_id,owner_id,'owner');
  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values (
    model_id,org_id,'TP-IND-001','Pilot Maker','industrial','{}'::jsonb
  );

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.dpp_set_active_organization(org_id);

  provisioned:=public.dpp_api_battery_provision(
    model_id,
    'urn:dpp:technical-pilot:draft:000001',
    '{"serial":"TP-000001"}'::jsonb,
    payload,
    '{}'::jsonb
  );
  v_passport_id:=(provisioned->>'passport_id')::uuid;

  if provisioned->>'passport_status'<>'draft' then
    raise exception 'Generic provision did not create DRAFT technical-pilot candidate';
  end if;

  select count(*)::integer into versions_before
  from public.dpp_passport_versions v
  where v.passport_id=v_passport_id;

  -- A DRAFT must not be publicly resolvable before explicit publication.
  denied:=false;
  begin
    perform public.dpp_api_passport_public('urn:dpp:technical-pilot:draft:000001');
  exception when sqlstate 'DP402' then denied:=true;
  end;
  if not denied then raise exception 'DRAFT passport was public before pilot activation'; end if;

  published:=public.dpp_api_technical_pilot_publish(
    (provisioned->>'item_id')::uuid,
    payload,
    '{}'::jsonb
  );

  if published->>'passport_id'<>v_passport_id::text
     or published->>'status'<>'active'
     or published->>'technical_pilot'<>'true'
     or published->>'regulatory_compliance'<>'false'
     or published->>'activated_from_draft'<>'true'
     or published->>'created'<>'false'
     or published->>'idempotent_replay'<>'false' then
    raise exception 'DRAFT-to-ACTIVE technical pilot response is invalid';
  end if;

  if published#>>'{public_payload,pilot,mode}'<>'technical_pilot'
     or published#>>'{public_payload,pilot,regulatory_compliance}'<>'false' then
    raise exception 'Technical pilot server marker is missing';
  end if;

  select count(*)::integer into versions_after
  from public.dpp_passport_versions v
  where v.passport_id=v_passport_id;

  if versions_after<>versions_before+1 then
    raise exception 'DRAFT activation did not append exactly one passport version';
  end if;

  public_row:=public.dpp_api_passport_public('urn:dpp:technical-pilot:draft:000001');
  if public_row->>'passport_id'<>v_passport_id::text
     or public_row->>'status'<>'active'
     or public_row#>>'{public_payload,pilot,mode}'<>'technical_pilot' then
    raise exception 'Activated technical pilot did not resolve publicly on the same identifier';
  end if;

  replay:=public.dpp_api_technical_pilot_publish(
    (provisioned->>'item_id')::uuid,
    payload,
    '{}'::jsonb
  );
  if replay->>'passport_id'<>v_passport_id::text
     or replay->>'idempotent_replay'<>'true'
     or replay->>'activated_from_draft'<>'false' then
    raise exception 'Technical pilot replay was not idempotent';
  end if;

  -- Payload drift after publication must fail closed.
  denied:=false;
  begin
    perform public.dpp_api_technical_pilot_publish(
      (provisioned->>'item_id')::uuid,
      jsonb_set(payload,'{model,physical}','{"weight_kg":12}'::jsonb,true),
      '{}'::jsonb
    );
  exception when sqlstate 'DP605' then denied:=true;
  end;
  if not denied then raise exception 'Technical pilot accepted divergent replay payload'; end if;

  -- LMT still cannot bypass the readiness gate through this route.
  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values (
    'e4444444-4444-4444-8444-444444444444',org_id,'TP-LMT-001','Pilot Maker','light_means_of_transport','{}'::jsonb
  );
  provisioned:=public.dpp_api_battery_provision(
    'e4444444-4444-4444-8444-444444444444',
    'urn:dpp:technical-pilot:lmt:blocked',
    '{}',
    '{"model":{"identification":{"category":"light_means_of_transport","model_id":"TP-LMT-001","manufacturer":{"name":"Pilot Maker"}}},"item":{"unique_identifier":"urn:dpp:technical-pilot:lmt:blocked"}}'::jsonb,
    '{}'
  );
  denied:=false;
  begin
    perform public.dpp_api_technical_pilot_publish(
      (provisioned->>'item_id')::uuid,
      provisioned->'public_payload',
      '{}'::jsonb
    );
  exception when sqlstate 'DP602' then denied:=true;
  end;
  if not denied then raise exception 'LMT technical pilot bypassed readiness gate'; end if;
end
$test$;

select 'TECHNICAL_PILOT_DRAFT_ACTIVATION_PASS' as result;
