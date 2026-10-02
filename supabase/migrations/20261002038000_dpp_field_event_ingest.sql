-- BAT02: tenant-scoped batch field-event ingestion.
-- One incoming field value becomes one immutable dpp_field_events row.

create or replace function public.dpp_api_field_events_append(
  p_subject_kind text,
  p_subject_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_event jsonb;
  v_field_path text;
  v_source_kind text;
  v_source_ref text;
  v_source_date timestamptz;
  v_access_level text;
  v_verification_status text;
  v_supersedes_id uuid;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_inserted integer := 0;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_subject_kind not in ('model','item','passport') or p_subject_id is null then
    raise exception 'invalid field-event subject' using errcode='DP701';
  end if;

  if p_subject_kind='model' and not exists (
    select 1 from public.dpp_battery_models m
    where m.id=p_subject_id and m.organization_id=v_org
  ) then
    raise exception 'field-event subject not found in active organization' using errcode='DP702';
  elsif p_subject_kind='item' and not exists (
    select 1 from public.dpp_battery_items i
    where i.id=p_subject_id and i.organization_id=v_org
  ) then
    raise exception 'field-event subject not found in active organization' using errcode='DP702';
  elsif p_subject_kind='passport' and not exists (
    select 1 from public.dpp_passports p
    where p.id=p_subject_id and p.organization_id=v_org
  ) then
    raise exception 'field-event subject not found in active organization' using errcode='DP702';
  end if;

  if p_events is null or jsonb_typeof(p_events)<>'array'
     or jsonb_array_length(p_events)<1 or jsonb_array_length(p_events)>500 then
    raise exception 'field events must be an array with 1..500 entries' using errcode='DP703';
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if jsonb_typeof(v_event)<>'object' or not (v_event ? 'value') then
      raise exception 'field event must be an object containing value' using errcode='DP703';
    end if;

    v_field_path:=nullif(btrim(v_event->>'field_path'),'');
    v_source_kind:=nullif(btrim(v_event->>'source_kind'),'');
    v_source_ref:=nullif(btrim(v_event->>'source_ref'),'');
    v_access_level:=nullif(btrim(v_event->>'access_level'),'');
    v_verification_status:=coalesce(nullif(btrim(v_event->>'verification_status'),''),'unverified');

    if v_field_path is null or length(v_field_path)>300 then
      raise exception 'invalid field_path' using errcode='DP704';
    end if;
    if v_source_kind not in ('manual','csv','xlsx','api','bms','derived','migration') then
      raise exception 'invalid source_kind' using errcode='DP704';
    end if;
    if v_source_ref is null or length(v_source_ref)>1000 then
      raise exception 'invalid source_ref' using errcode='DP704';
    end if;
    if v_access_level not in ('public','public_identifier','legitimate_interest','authority_only') then
      raise exception 'invalid access_level' using errcode='DP704';
    end if;
    if v_verification_status not in ('unverified','validated','verified','rejected') then
      raise exception 'invalid verification_status' using errcode='DP704';
    end if;

    begin
      v_source_date:=(v_event->>'source_date')::timestamptz;
    exception when others then
      raise exception 'invalid source_date' using errcode='DP704';
    end;
    if v_source_date is null then
      raise exception 'invalid source_date' using errcode='DP704';
    end if;

    v_supersedes_id:=null;
    if v_event ? 'supersedes_id' and v_event->>'supersedes_id' is not null then
      begin
        v_supersedes_id:=(v_event->>'supersedes_id')::uuid;
      exception when others then
        raise exception 'invalid supersedes_id' using errcode='DP704';
      end;

      if not exists (
        select 1
        from public.dpp_field_events e
        where e.id=v_supersedes_id
          and e.organization_id=v_org
          and e.subject_kind=p_subject_kind
          and e.subject_id=p_subject_id
          and e.field_path=v_field_path
      ) then
        raise exception 'superseded field event does not match subject/field'
          using errcode='DP705';
      end if;
    end if;

    insert into public.dpp_field_events(
      organization_id,subject_kind,subject_id,field_path,value,
      source_kind,source_ref,source_date,access_level,verification_status,
      supersedes_id,recorded_by
    ) values (
      v_org,p_subject_kind,p_subject_id,v_field_path,v_event->'value',
      v_source_kind,v_source_ref,v_source_date,v_access_level,v_verification_status,
      v_supersedes_id,v_user
    )
    returning id into v_id;

    v_ids:=v_ids || jsonb_build_array(v_id);
    v_inserted:=v_inserted+1;
  end loop;

  return jsonb_build_object(
    'subject_kind',p_subject_kind,
    'subject_id',p_subject_id,
    'inserted',v_inserted,
    'event_ids',v_ids
  );
end
$fn$;

revoke all on function public.dpp_api_field_events_append(text,uuid,jsonb) from public,anon;
grant execute on function public.dpp_api_field_events_append(text,uuid,jsonb) to authenticated;

comment on function public.dpp_api_field_events_append(text,uuid,jsonb) is
  'BAT02: atomically append one immutable typed JSON field-event row for each supplied field value inside the active DPP tenant.';
