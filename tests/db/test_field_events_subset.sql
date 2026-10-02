-- BAT01-BAT08 database acceptance precursor for field-level DPP history.
do $bat_field_events$
declare
  v_org uuid := '31000000-0000-4000-8000-000000000001';
  v_subject uuid := '32000000-0000-4000-8000-000000000001';
  v_first uuid := '33000000-0000-4000-8000-000000000001';
  v_second uuid := '33000000-0000-4000-8000-000000000002';
  v_count integer;
  mutation_rejected boolean := false;
  invalid_access_rejected boolean := false;
  public_identifier_accepted boolean := false;
  catalog_access_rejected boolean := false;
begin
  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'BAT Field Event Test','bat-field-event-test');

  insert into public.dpp_field_events(
    id,organization_id,subject_kind,subject_id,field_path,value,
    source_kind,source_ref,source_date,access_level,verification_status,recorded_at
  ) values(
    v_first,v_org,'model',v_subject,'model.identification.manufacturer.name',
    '"Example Battery Co."'::jsonb,
    'csv','pilot.csv:row=2:manufacturer_name','2026-10-01T10:00:00Z',
    'public','validated','2026-10-02T00:00:00Z'
  );

  insert into public.dpp_field_events(
    id,organization_id,subject_kind,subject_id,field_path,value,
    source_kind,source_ref,source_date,access_level,verification_status,supersedes_id,recorded_at
  ) values(
    v_second,v_org,'model',v_subject,'model.identification.manufacturer.name',
    '"Example Battery Co. AD"'::jsonb,
    'api','manufacturer-api:model=EXAMPLE-1','2026-10-02T00:30:00Z',
    'public','verified',v_first,'2026-10-02T01:00:00Z'
  );

  select count(*) into v_count
  from public.dpp_field_events
  where organization_id=v_org
    and subject_id=v_subject
    and field_path='model.identification.manufacturer.name';
  if v_count <> 2 then
    raise exception 'BAT field history expected 2 events, got %', v_count;
  end if;

  begin
    update public.dpp_field_events
    set verification_status='rejected'
    where id=v_first;
  exception when sqlstate '55000' then
    mutation_rejected := true;
  end;
  if not mutation_rejected then
    raise exception 'BAT append-only update was not rejected';
  end if;

  begin
    insert into public.dpp_field_events(
      organization_id,subject_kind,subject_id,field_path,value,
      source_kind,source_ref,source_date,access_level,verification_status
    ) values(
      v_org,'model',v_subject,'model.identification.manufacturer.name',
      '"Bad Access"'::jsonb,
      'manual','manual:test','2026-10-02T01:00:00Z',
      'invalid_access','unverified'
    );
  exception when sqlstate 'DP706' then
    invalid_access_rejected := true;
  end;
  if not invalid_access_rejected then
    raise exception 'BAT invalid access level was not rejected with canonical DP706';
  end if;

  insert into public.dpp_field_events(
    organization_id,subject_kind,subject_id,field_path,value,
    source_kind,source_ref,source_date,access_level,verification_status
  ) values(
    v_org,'item',v_subject,'item.unique_identifier',
    '"BAT-TEST-0001"'::jsonb,
    'api','identifier-service:test','2026-10-02T01:30:00Z',
    'public_identifier','validated'
  );
  public_identifier_accepted := true;

  if not public_identifier_accepted then
    raise exception 'BAT public_identifier access class was not accepted';
  end if;


  begin
    insert into public.dpp_field_events(
      organization_id,subject_kind,subject_id,field_path,value,
      source_kind,source_ref,source_date,access_level,verification_status
    ) values(
      v_org,'model',v_subject,'model.identification.manufacturer.name',
      '"Wrong Access"'::jsonb,
      'api','bat05:mismatch','2026-10-02T02:42:00Z',
      'legitimate_interest','validated'
    );
  exception when sqlstate 'DP706' then
    catalog_access_rejected := true;
  end;
  if not catalog_access_rejected then
    raise exception 'BAT05 catalog access mismatch was not rejected';
  end if;
end
$bat_field_events$;


-- BAT02 runtime batch-ingest acceptance: one supplied field value -> one immutable row,
-- preserving JSON value type and tenant/RBAC ownership.
do $bat02_ingest$
declare
  v_user uuid := '34000000-0000-4000-8000-000000000001';
  v_org uuid := '34000000-0000-4000-8000-000000000002';
  v_model uuid := '34000000-0000-4000-8000-000000000003';
  v_result jsonb;
  v_count integer;
  v_types text[];
  denied boolean := false;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false)',
      v_user
    );
  else
    insert into auth.users(id) values (v_user);
  end if;

  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'BAT02 Field Ingest','bat02-field-ingest');

  insert into public.dpp_organization_members(organization_id,user_id,role)
  values(v_org,v_user,'editor');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data,created_by
  ) values(
    v_model,v_org,'BAT02-MODEL','BAT02 Maker','industrial','{}'::jsonb,v_user
  );

  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform public.dpp_set_active_organization(v_org);

  v_result:=public.dpp_api_field_events_append(
    'model',
    v_model,
    jsonb_build_array(
      jsonb_build_object(
        'field_path','model.identification.manufacturer.name',
        'value','BAT02 Maker',
        'source_kind','api',
        'source_ref','bat02:test:string',
        'source_date','2026-10-02T02:10:00Z',
        'access_level','public',
        'verification_status','validated'
      ),
      jsonb_build_object(
        'field_path','model.physical.weight_kg',
        'value',82.5,
        'source_kind','api',
        'source_ref','bat02:test:number',
        'source_date','2026-10-02T02:10:01Z',
        'access_level','public',
        'verification_status','verified'
      ),
      jsonb_build_object(
        'field_path','model.carbon_footprint',
        'value',jsonb_build_object('total_kg_co2e',3200,'method','PEF'),
        'source_kind','api',
        'source_ref','bat02:test:object',
        'source_date','2026-10-02T02:10:02Z',
        'access_level','public',
        'verification_status','unverified'
      ),
      jsonb_build_object(
        'field_path','model.composition.hazardous_substances',
        'value',jsonb_build_array('lead','nickel'),
        'source_kind','api',
        'source_ref','bat02:test:array',
        'source_date','2026-10-02T02:10:03Z',
        'access_level','public',
        'verification_status','rejected'
      )
    )
  );

  if (v_result->>'inserted')::int <> 4
     or jsonb_array_length(v_result->'event_ids') <> 4 then
    raise exception 'BAT02 expected 4 independent field events, got %',v_result;
  end if;

  select count(*),
         array_agg(jsonb_typeof(value) order by field_path)
    into v_count,v_types
  from public.dpp_field_events
  where organization_id=v_org and subject_kind='model' and subject_id=v_model;

  if v_count <> 4 then
    raise exception 'BAT02 stored row count expected 4, got %',v_count;
  end if;

  if not (
    'string'=any(v_types)
    and 'number'=any(v_types)
    and 'object'=any(v_types)
    and 'array'=any(v_types)
  ) then
    raise exception 'BAT02 typed JSON preservation failed: %',v_types;
  end if;

  if (
    select count(distinct source_ref) <> 4
       or bool_and(source_kind='api' and length(btrim(source_ref))>0) is not true
    from public.dpp_field_events
    where organization_id=v_org and subject_kind='model' and subject_id=v_model
  ) then
    raise exception 'BAT03 provenance persistence failed';
  end if;

  if (
    select bool_and(source_date is not null and recorded_at is not null and recorded_at > source_date) is not true
    from public.dpp_field_events
    where organization_id=v_org and subject_kind='model' and subject_id=v_model
  ) then
    raise exception 'BAT04 source_date/recorded_at separation failed';
  end if;

  if (
    select bool_and(source_date < recorded_at) is not true
    from public.dpp_field_events
    where organization_id=v_org and subject_kind='model' and subject_id=v_model
  ) then
    raise exception 'BAT04 source date independence failed';
  end if;


  if (
    select array_agg(distinct verification_status order by verification_status)
    from public.dpp_field_events
    where organization_id=v_org and subject_kind='model' and subject_id=v_model
  ) <> array['rejected','unverified','validated','verified']::text[] then
    raise exception 'BAT06 verification status coverage failed';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_field_events_append(
      'model',
      v_model,
      jsonb_build_array(jsonb_build_object(
        'field_path','model.identification.manufacturer.name',
        'value','BAD-STATUS',
        'source_kind','api',
        'source_ref','bat06:bad-status',
        'source_date','2026-10-02T02:10:04Z',
        'access_level','public',
        'verification_status','trusted'
      ))
    );
  exception when sqlstate 'DP704' then
    denied:=true;
  end;
  if not denied then
    raise exception 'BAT06 invalid verification status was not rejected';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_field_events_append(
      'model',
      v_model,
      jsonb_build_array(jsonb_build_object(
        'field_path','model.identification.manufacturer.name',
        'value','BAD-PROVENANCE',
        'source_kind','unknown',
        'source_ref','',
        'source_date','2026-10-02T02:10:05Z',
        'access_level','public'
      ))
    );
  exception when sqlstate 'DP704' then
    denied:=true;
  end;
  if not denied then
    raise exception 'BAT03 invalid provenance was not rejected';
  end if;

  if (
    select access_level
    from public.dpp_field_catalog_runtime
    where field_path='model.identification.manufacturer.name'
  ) <> 'public' then
    raise exception 'BAT05 runtime catalog access projection mismatch';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_field_events_append(
      'model',
      v_model,
      jsonb_build_array(jsonb_build_object(
        'field_path','model.identification.manufacturer.name',
        'value','WRONG-ACCESS',
        'source_kind','api',
        'source_ref','bat05:wrong-access',
        'source_date','2026-10-02T02:12:00Z',
        'access_level','authority_only'
      ))
    );
  exception when sqlstate 'DP706' then
    denied:=true;
  end;
  if not denied then
    raise exception 'BAT05 wrong canonical access was not rejected';
  end if;

  denied:=false;
  begin
    perform public.dpp_api_field_events_append(
      'model',
      v_model,
      jsonb_build_array(jsonb_build_object(
        'field_path','model.nonexistent.catalog_field',
        'value','UNKNOWN',
        'source_kind','api',
        'source_ref','bat05:unknown-field',
        'source_date','2026-10-02T02:12:01Z',
        'access_level','public'
      ))
    );
  exception when sqlstate 'DP706' then
    denied:=true;
  end;
  if not denied then
    raise exception 'BAT05 unknown canonical field was not rejected';
  end if;

  -- A subject outside the active tenant must fail without inserting anything.
  begin
    perform public.dpp_api_field_events_append(
      'model',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      jsonb_build_array(jsonb_build_object(
        'field_path','model.identification.manufacturer.name',
        'value','NOPE',
        'source_kind','api',
        'source_ref','bat02:cross-tenant',
        'source_date','2026-10-02T02:11:00Z',
        'access_level','public'
      ))
    );
  exception when sqlstate 'DP702' then
    denied:=true;
  end;
  if not denied then
    raise exception 'BAT02 cross-tenant/nonexistent subject was not denied';
  end if;
end
$bat02_ingest$;

select 'BAT_FIELD_EVENTS_DB_PASS' as result;
