-- T02 partial integration suite for already-GREEN database capabilities.
-- Intentionally excludes still-RED M05/M10/M12/M13; T02 must remain RED until those dependencies are complete.

do $t02$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_model uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_item uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_passport uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_mapping uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_submission uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_import uuid := '11111111-2222-4333-8444-555555555555';
  v_count integer;
  v_revision integer;
  v_attempts integer;
  v_result jsonb;
  immutable_rejected boolean := false;
  lifecycle_rejected boolean := false;
  registry_rejected boolean := false;
begin
  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'T02 Integration Org','t02-integration');

  insert into public.dpp_import_mappings(
    id,organization_id,name,source_headers,field_mapping
  ) values(
    v_mapping,v_org,'T02 Mapping',
    '["manufacturer_name","model_id"]'::jsonb,
    '{"manufacturer_name":"model.identification.manufacturer.name","model_id":"model.identification.model_id"}'::jsonb
  );

  update public.dpp_import_mappings
  set name='T02 Mapping v2'
  where id=v_mapping;

  select revision into v_revision
  from public.dpp_import_mappings where id=v_mapping;
  if v_revision<>2 then
    raise exception 'T02 M07 mapping revision expected 2, got %',v_revision;
  end if;

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(
    v_model,v_org,'T02-MODEL','T02 Manufacturer','electric_vehicle',
    '{"rated_capacity_ah":230,"composition":{"chemistry":"NMC811"}}'::jsonb
  );

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data
  ) values(
    v_item,v_org,v_model,'urn:dpp:t02:000001','original',
    '{"state_of_health":{"percent":100}}'::jsonb
  );

  insert into public.dpp_passports(
    id,organization_id,battery_item_id,status,public_payload,private_payload
  ) values(
    v_passport,v_org,v_item,'draft',
    '{"model":"T02-MODEL"}'::jsonb,
    '{"restricted":true}'::jsonb
  );

  select count(*) into v_count
  from public.dpp_passport_versions
  where passport_id=v_passport;
  if v_count<>1 then
    raise exception 'T02 M11 initial passport version expected 1, got %',v_count;
  end if;

  update public.dpp_passports
  set public_payload='{"model":"T02-MODEL","rev":2}'::jsonb
  where id=v_passport;

  select count(*) into v_count
  from public.dpp_passport_versions
  where passport_id=v_passport;
  if v_count<>2 then
    raise exception 'T02 M11 passport version count expected 2, got %',v_count;
  end if;

  begin
    delete from public.dpp_passport_versions
    where passport_id=v_passport and version_no=1;
  exception when others then
    immutable_rejected := true;
  end;
  if not immutable_rejected then
    raise exception 'T02 M11 immutable version deletion was not rejected';
  end if;

  update public.dpp_battery_items
  set lifecycle_status='second_life'
  where id=v_item;

  begin
    update public.dpp_battery_items
    set lifecycle_status='original'
    where id=v_item;
  exception when check_violation then
    lifecycle_rejected := true;
  end;
  if not lifecycle_rejected then
    raise exception 'T02 M14 invalid lifecycle reversal was not rejected';
  end if;

  insert into public.dpp_registry_submissions(
    id,organization_id,battery_item_id,passport_id,environment,provider,status,request_payload
  ) values(
    v_submission,v_org,v_item,v_passport,'test','eu_dpp_registry','draft',
    '{"suite":"T02"}'::jsonb
  );

  update public.dpp_registry_submissions set status='queued' where id=v_submission;
  update public.dpp_registry_submissions set status='submitted' where id=v_submission;
  update public.dpp_registry_submissions set status='accepted',external_reference='T02-ACCEPTED' where id=v_submission;

  select attempt_count into v_attempts
  from public.dpp_registry_submissions where id=v_submission;
  if v_attempts<>1 then
    raise exception 'T02 M16 registry attempt count expected 1, got %',v_attempts;
  end if;

  begin
    update public.dpp_registry_submissions set status='draft' where id=v_submission;
  exception when check_violation then
    registry_rejected := true;
  end;
  if not registry_rejected then
    raise exception 'T02 M16 invalid registry reversal was not rejected';
  end if;

  insert into public.dpp_import_runs(id,organization_id,status)
  values(v_import,v_org,'staged');

  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import,1,
    '{"model_identifier":"T02-IMPORTED","manufacturer_name":"T02 Import Manufacturer","category":"electric_vehicle","canonical_data":{"rated_capacity_ah":180}}'::jsonb,
    '{"unique_identifier":"urn:dpp:t02:import:000001","lifecycle_status":"original","canonical_data":{"state_of_health":{"percent":98}}}'::jsonb,
    '[]'::jsonb
  );

  v_result:=public.dpp_validate_import(v_import);
  if v_result->>'status'<>'validated' then
    raise exception 'T02 M20 import validation failed: %',v_result;
  end if;

  v_result:=public.dpp_commit_import(v_import);
  if v_result->>'status'<>'committed' or (v_result->>'committed_rows')::int<>1 then
    raise exception 'T02 M20 import commit failed: %',v_result;
  end if;

  select count(*) into v_count
  from public.dpp_battery_items
  where organization_id=v_org
    and unique_identifier='urn:dpp:t02:import:000001';
  if v_count<>1 then
    raise exception 'T02 M20 imported item count expected 1, got %',v_count;
  end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name like 'dpp_%'
    and grantee in ('anon','authenticated');
  if v_count<>0 then
    raise exception 'T02 deny-by-default regression: % anon/authenticated table grants found',v_count;
  end if;
end
$t02$;

select 'T02_GREEN_DB_SUBSET_PASS' as result;
