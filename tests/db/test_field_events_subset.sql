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
  exception when check_violation then
    invalid_access_rejected := true;
  end;
  if not invalid_access_rejected then
    raise exception 'BAT invalid access level was not rejected';
  end if;

  insert into public.dpp_field_events(
    organization_id,subject_kind,subject_id,field_path,value,
    source_kind,source_ref,source_date,access_level,verification_status
  ) values(
    v_org,'item',v_subject,'item.identification.unique_identifier',
    '"BAT-TEST-0001"'::jsonb,
    'api','identifier-service:test','2026-10-02T01:30:00Z',
    'public_identifier','validated'
  );
  public_identifier_accepted := true;

  if not public_identifier_accepted then
    raise exception 'BAT public_identifier access class was not accepted';
  end if;
end
$bat_field_events$;

select 'BAT_FIELD_EVENTS_DB_PASS' as result;
