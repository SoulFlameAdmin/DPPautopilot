-- Step 37: tenant-scoped reusable CSV/XLSX import mapping profiles.

alter table public.dpp_import_mappings
  drop constraint if exists dpp_import_mappings_source_format_check;

alter table public.dpp_import_mappings
  add constraint dpp_import_mappings_source_format_check
  check (source_format in ('csv','xlsx'));

create or replace function public.dpp_api_import_mapping_list()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_rows jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',m.id,
        'name',m.name,
        'source_format',m.source_format,
        'source_headers',m.source_headers,
        'field_mapping',m.field_mapping,
        'revision',m.revision,
        'created_at',m.created_at,
        'updated_at',m.updated_at
      )
      order by lower(m.name),m.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.dpp_import_mappings m
  where m.organization_id=v_org;

  return v_rows;
end
$fn$;

create or replace function public.dpp_api_import_mapping_save(
  p_id uuid,
  p_name text,
  p_source_format text,
  p_source_headers jsonb,
  p_field_mapping jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_name text;
  v_row public.dpp_import_mappings%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();
  v_name:=btrim(coalesce(p_name,''));

  if length(v_name)<1 or length(v_name)>160 then
    raise exception 'mapping name must contain 1..160 characters'
      using errcode='DP009';
  end if;

  if p_source_format not in ('csv','xlsx') then
    raise exception 'unsupported source format'
      using errcode='DP009';
  end if;

  if p_source_headers is null or jsonb_typeof(p_source_headers)<>'array'
     or jsonb_array_length(p_source_headers)<1
     or jsonb_array_length(p_source_headers)>100 then
    raise exception 'source_headers must contain 1..100 entries'
      using errcode='DP009';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_source_headers) e
    where jsonb_typeof(e.value)<>'string'
       or length(btrim(e.value #>> '{}'))<1
  ) then
    raise exception 'source_headers must contain non-empty strings'
      using errcode='DP009';
  end if;

  if (
    select count(*)<>count(distinct lower(btrim(e.value #>> '{}')))
    from jsonb_array_elements(p_source_headers) e
  ) then
    raise exception 'source_headers must be unique'
      using errcode='DP009';
  end if;

  if p_field_mapping is null or jsonb_typeof(p_field_mapping)<>'object' then
    raise exception 'field_mapping must be an object'
      using errcode='DP009';
  end if;

  if exists (
    select 1
    from jsonb_each(p_field_mapping) e
    where length(btrim(e.key))<1
       or jsonb_typeof(e.value)<>'string'
  ) then
    raise exception 'field_mapping keys and values must be strings'
      using errcode='DP009';
  end if;

  if p_id is null then
    insert into public.dpp_import_mappings(
      organization_id,name,source_format,source_headers,field_mapping,created_by
    ) values (
      v_org,v_name,p_source_format,p_source_headers,p_field_mapping,v_user
    )
    on conflict (organization_id,name)
    do update set
      source_format=excluded.source_format,
      source_headers=excluded.source_headers,
      field_mapping=excluded.field_mapping
    returning * into v_row;
  else
    update public.dpp_import_mappings
    set name=v_name,
        source_format=p_source_format,
        source_headers=p_source_headers,
        field_mapping=p_field_mapping
    where id=p_id and organization_id=v_org
    returning * into v_row;

    if not found then
      raise exception 'import mapping not found in active organization'
        using errcode='DP010';
    end if;
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'name',v_row.name,
    'source_format',v_row.source_format,
    'source_headers',v_row.source_headers,
    'field_mapping',v_row.field_mapping,
    'revision',v_row.revision,
    'created_at',v_row.created_at,
    'updated_at',v_row.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_import_mapping_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_id uuid;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  delete from public.dpp_import_mappings
  where id=p_id and organization_id=v_org
  returning id into v_id;

  if v_id is null then
    raise exception 'import mapping not found in active organization'
      using errcode='DP010';
  end if;

  return jsonb_build_object('id',v_id,'deleted',true);
end
$fn$;

revoke all on function public.dpp_api_import_mapping_list() from public,anon;
revoke all on function public.dpp_api_import_mapping_save(uuid,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.dpp_api_import_mapping_delete(uuid) from public,anon;

grant execute on function public.dpp_api_import_mapping_list() to authenticated;
grant execute on function public.dpp_api_import_mapping_save(uuid,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.dpp_api_import_mapping_delete(uuid) to authenticated;

comment on function public.dpp_api_import_mapping_list() is
  'Step 37: list reusable import mapping profiles for the explicit active DPP tenant.';
comment on function public.dpp_api_import_mapping_save(uuid,text,text,jsonb,jsonb) is
  'Step 37: create or update one reusable CSV/XLSX mapping profile inside the active DPP tenant.';
comment on function public.dpp_api_import_mapping_delete(uuid) is
  'Step 37: delete one reusable import mapping profile inside the active DPP tenant.';
