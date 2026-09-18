-- R03 partial negative input validation for the already-GREEN M20 database boundary.
-- R03 remains RED until M13 and M17-M20 server/file validation are implemented and covered.

do $r03$
declare
  v_org uuid := '51515151-5151-4151-8151-515151515151';
  v_import uuid := '52525252-5252-4252-8252-525252525252';
  v_seen boolean;
begin
  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'R03 Input Validation','r03-input-validation');

  -- Import run counters must not accept negative values.
  v_seen:=false;
  begin
    insert into public.dpp_import_runs(organization_id,status,row_count,error_count)
    values(v_org,'staged',-1,0);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 negative row_count was accepted'; end if;

  insert into public.dpp_import_runs(id,organization_id,status,row_count,error_count)
  values(v_import,v_org,'validated',1,0);

  -- Row number must be positive.
  v_seen:=false;
  begin
    insert into public.dpp_import_rows(
      import_id,row_number,normalized_model,normalized_item,validation_errors
    ) values(v_import,0,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 row_number=0 was accepted'; end if;

  -- Normalized model and item payloads must be JSON objects.
  v_seen:=false;
  begin
    insert into public.dpp_import_rows(
      import_id,row_number,normalized_model,normalized_item,validation_errors
    ) values(v_import,1,'[]'::jsonb,'{}'::jsonb,'[]'::jsonb);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 array normalized_model was accepted'; end if;

  v_seen:=false;
  begin
    insert into public.dpp_import_rows(
      import_id,row_number,normalized_model,normalized_item,validation_errors
    ) values(v_import,1,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 array normalized_item was accepted'; end if;

  -- Validation errors must be a JSON array.
  v_seen:=false;
  begin
    insert into public.dpp_import_rows(
      import_id,row_number,normalized_model,normalized_item,validation_errors
    ) values(v_import,1,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 object validation_errors was accepted'; end if;

  -- Disallowed model category must fail closed during commit.
  delete from public.dpp_import_rows where import_id=v_import;
  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import,1,
    '{"model_identifier":"R03-BAD-CAT","manufacturer_name":"R03","category":"forbidden_category"}'::jsonb,
    '{"unique_identifier":"urn:dpp:r03:bad-category","lifecycle_status":"original"}'::jsonb,
    '[]'::jsonb
  );
  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 disallowed category was accepted'; end if;

  -- Oversize model identifier (>128) must fail closed.
  update public.dpp_import_rows
  set normalized_model=jsonb_build_object(
    'model_identifier',repeat('M',129),
    'manufacturer_name','R03',
    'category','electric_vehicle'
  ),
  normalized_item='{"unique_identifier":"urn:dpp:r03:oversize-model","lifecycle_status":"original"}'::jsonb
  where import_id=v_import and row_number=1;

  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 oversize model identifier was accepted'; end if;

  -- Invalid lifecycle status must fail closed.
  update public.dpp_import_rows
  set normalized_model='{"model_identifier":"R03-BAD-LIFE","manufacturer_name":"R03","category":"electric_vehicle"}'::jsonb,
      normalized_item='{"unique_identifier":"urn:dpp:r03:bad-life","lifecycle_status":"forbidden_status"}'::jsonb
  where import_id=v_import and row_number=1;

  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 disallowed lifecycle status was accepted'; end if;

  -- Oversize global item identifier (>300) must fail closed.
  update public.dpp_import_rows
  set normalized_model='{"model_identifier":"R03-LONG-ITEM","manufacturer_name":"R03","category":"electric_vehicle"}'::jsonb,
      normalized_item=jsonb_build_object(
        'unique_identifier',repeat('U',301),
        'lifecycle_status','original'
      )
  where import_id=v_import and row_number=1;

  v_seen:=false;
  begin
    perform public.dpp_commit_import(v_import);
  exception when check_violation then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R03 oversize item identifier was accepted'; end if;
end
$r03$;

select 'R03_M20_INPUT_VALIDATION_SUBSET_PASS' as result;
