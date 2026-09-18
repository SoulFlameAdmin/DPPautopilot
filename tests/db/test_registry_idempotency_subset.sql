-- M23 partial registry submission idempotency coverage for GREEN M15/M16.
-- M23 remains RED until M17-M19 API-level conflicts are implemented and covered.

do $m23_registry$
declare
  v_org uuid := 'aaaaaaaa-1111-4111-8111-aaaaaaaa1111';
  v_model uuid := 'bbbbbbbb-2222-4222-8222-bbbbbbbb2222';
  v_item uuid := 'cccccccc-3333-4333-8333-cccccccc3333';
  v_passport uuid := 'dddddddd-4444-4444-8444-dddddddd4444';
  v_first jsonb;
  v_second jsonb;
  v_count integer;
  v_conflict_rejected boolean := false;
begin
  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'M23 Registry Idempotency','m23-registry-idempotency');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(
    v_model,v_org,'M23-REG-MODEL','M23 Registry Manufacturer','electric_vehicle','{}'::jsonb
  );

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data
  ) values(
    v_item,v_org,v_model,'urn:dpp:m23:registry:000001','original','{}'::jsonb
  );

  insert into public.dpp_passports(
    id,organization_id,battery_item_id,status,public_payload,private_payload
  ) values(
    v_passport,v_org,v_item,'draft','{}'::jsonb,'{}'::jsonb
  );

  v_first:=public.dpp_create_registry_submission(
    v_org,v_item,v_passport,'test','eu_dpp_registry','m23-registry-key-1',
    '{"source":"M23","sequence":1}'::jsonb,null
  );

  v_second:=public.dpp_create_registry_submission(
    v_org,v_item,v_passport,'test','eu_dpp_registry','m23-registry-key-1',
    '{"source":"M23","sequence":1}'::jsonb,null
  );

  if coalesce((v_first->>'already_exists')::boolean,true) then
    raise exception 'M23 first registry create incorrectly reported existing';
  end if;

  if not coalesce((v_second->>'already_exists')::boolean,false) then
    raise exception 'M23 duplicate registry create did not report existing';
  end if;

  if v_first->>'submission_id' is distinct from v_second->>'submission_id' then
    raise exception 'M23 duplicate registry create returned different submission ids';
  end if;

  select count(*) into v_count
  from public.dpp_registry_submissions
  where organization_id=v_org
    and provider='eu_dpp_registry'
    and environment='test'
    and idempotency_key='m23-registry-key-1';

  if v_count<>1 then
    raise exception 'M23 expected exactly one registry submission, got %',v_count;
  end if;

  begin
    perform public.dpp_create_registry_submission(
      v_org,v_item,v_passport,'test','eu_dpp_registry','m23-registry-key-1',
      '{"source":"M23","sequence":2}'::jsonb,null
    );
  exception when check_violation then
    v_conflict_rejected := true;
  end;

  if not v_conflict_rejected then
    raise exception 'M23 idempotency key reuse with different payload was not rejected';
  end if;
end
$m23_registry$;

select 'M23_REGISTRY_IDEMPOTENCY_SUBSET_PASS' as result;
