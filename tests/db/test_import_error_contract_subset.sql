-- M22 partial stable error-code integration suite for GREEN M20.
-- M22 remains RED until M17-M19 expose and test these semantics through the API.

do $m22$
declare
  v_org uuid := '10101010-1010-4010-8010-101010101010';
  v_model uuid := '20202020-2020-4020-8020-202020202020';
  v_item uuid := '30303030-3030-4030-8030-303030303030';
  v_import_empty uuid := '40404040-4040-4040-8040-404040404040';
  v_import_invalid uuid := '50505050-5050-4050-8050-505050505050';
  v_import_row_errors uuid := '60606060-6060-4060-8060-606060606060';
  v_import_missing_identity uuid := '70707070-7070-4070-8070-707070707070';
  v_import_mismatch uuid := '80808080-8080-4080-8080-808080808080';
  v_import_inconsistent uuid := '90909090-9090-4090-8090-909090909090';
  v_import_duplicate uuid := 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0';
  v_seen boolean;
begin
  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'M22 Error Contract','m22-error-contract');

  -- DP001: missing import.
  v_seen:=false;
  begin
    perform public.dpp_validate_import('11111111-1111-4111-8111-111111111111'::uuid);
  exception when sqlstate 'DP001' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M22 DP001 not raised'; end if;

  -- DP002: no staged rows.
  insert into public.dpp_import_runs(id,organization_id,status)
  values(v_import_empty,v_org,'staged');
  v_seen:=false;
  begin
    perform public.dpp_validate_import(v_import_empty);
  exception when sqlstate 'DP002' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M22 DP002 not raised'; end if;

  -- DP003: invalid import cannot commit.
  insert into public.dpp_import_runs(id,organization_id,status)
  values(v_import_invalid,v_org,'staged');
  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import_invalid,1,'{}'::jsonb,'{}'::jsonb,
    '[{"code":"required","field":"model_identifier"}]'::jsonb
  );
  perform public.dpp_validate_import(v_import_invalid);
  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import_invalid);
  exception when sqlstate 'DP003' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M22 DP003 not raised'; end if;

  -- DP004: fail closed if row errors contradict a manually marked validated run.
  insert into public.dpp_import_runs(id,organization_id,status,row_count,error_count)
  values(v_import_row_errors,v_org,'validated',1,0);
  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import_row_errors,1,
    '{"model_identifier":"M22-A","manufacturer_name":"M22","category":"electric_vehicle"}'::jsonb,
    '{"unique_identifier":"urn:dpp:m22:a"}'::jsonb,
    '[{"code":"synthetic"}]'::jsonb
  );
  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import_row_errors);
  exception when sqlstate 'DP004' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M22 DP004 not raised'; end if;

  -- DP005: required normalized identity missing.
  insert into public.dpp_import_runs(id,organization_id,status,row_count,error_count)
  values(v_import_missing_identity,v_org,'validated',1,0);
  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import_missing_identity,1,
    '{"manufacturer_name":"M22","category":"electric_vehicle"}'::jsonb,
    '{"unique_identifier":"urn:dpp:m22:b"}'::jsonb,
    '[]'::jsonb
  );
  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import_missing_identity);
  exception when sqlstate 'DP005' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M22 DP005 not raised'; end if;

  -- DP006: row-count mismatch.
  insert into public.dpp_import_runs(id,organization_id,status,row_count,error_count)
  values(v_import_mismatch,v_org,'validated',2,0);
  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import_mismatch,1,
    '{"model_identifier":"M22-C","manufacturer_name":"M22","category":"electric_vehicle"}'::jsonb,
    '{"unique_identifier":"urn:dpp:m22:c"}'::jsonb,
    '[]'::jsonb
  );
  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import_mismatch);
  exception when sqlstate 'DP006' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M22 DP006 not raised'; end if;

  -- DP007: committed state with missing row links.
  insert into public.dpp_import_runs(id,organization_id,status,row_count,error_count,committed_at)
  values(v_import_inconsistent,v_org,'committed',1,0,now());
  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import_inconsistent,1,
    '{"model_identifier":"M22-D","manufacturer_name":"M22","category":"electric_vehicle"}'::jsonb,
    '{"unique_identifier":"urn:dpp:m22:d"}'::jsonb,
    '[]'::jsonb
  );
  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import_inconsistent);
  exception when sqlstate 'DP007' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M22 DP007 not raised'; end if;

  -- DP008: duplicate global battery identifier.
  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(v_model,v_org,'M22-EXISTING','M22 Existing','electric_vehicle','{}'::jsonb);
  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data
  ) values(v_item,v_org,v_model,'urn:dpp:m22:duplicate','original','{}'::jsonb);

  insert into public.dpp_import_runs(id,organization_id,status)
  values(v_import_duplicate,v_org,'staged');
  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import_duplicate,1,
    '{"model_identifier":"M22-NEW","manufacturer_name":"M22 New","category":"electric_vehicle"}'::jsonb,
    '{"unique_identifier":"urn:dpp:m22:duplicate","lifecycle_status":"original"}'::jsonb,
    '[]'::jsonb
  );
  perform public.dpp_validate_import(v_import_duplicate);
  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import_duplicate);
  exception when sqlstate 'DP008' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M22 DP008 not raised'; end if;
end
$m22$;

select 'M22_IMPORT_ERROR_CONTRACT_SUBSET_PASS' as result;
