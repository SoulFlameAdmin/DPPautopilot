-- Stage 6: server-validated production import error reporting for LMT batch files.

create or replace function public.dpp_api_import_create(
  p_rows jsonb,
  p_mapping_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_import_id uuid;
  v_row jsonb;
  v_idx integer := 0;
  v_errors jsonb;
  v_model jsonb;
  v_item jsonb;
  v_category text;
  v_lifecycle text;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_rows is null or jsonb_typeof(p_rows)<>'array'
     or jsonb_array_length(p_rows)<1
     or jsonb_array_length(p_rows)>1000 then
    raise exception 'rows must be a JSON array with 1..1000 elements'
      using errcode='DP009';
  end if;

  if p_mapping_id is not null and not exists (
    select 1 from public.dpp_import_mappings m
    where m.id=p_mapping_id and m.organization_id=v_org
  ) then
    raise exception 'import mapping not found in active organization'
      using errcode='DP010';
  end if;

  insert into public.dpp_import_runs(
    organization_id,mapping_id,status,created_by
  ) values (
    v_org,p_mapping_id,'staged',v_user
  )
  returning id into v_import_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx:=v_idx+1;
    v_errors:='[]'::jsonb;

    if jsonb_typeof(v_row)<>'object'
       or jsonb_typeof(v_row->'normalized_model')<>'object'
       or jsonb_typeof(v_row->'normalized_item')<>'object' then
      raise exception 'import row % must contain normalized_model and normalized_item objects',v_idx
        using errcode='DP009';
    end if;

    v_model:=v_row->'normalized_model';
    v_item:=v_row->'normalized_item';

    if nullif(btrim(v_model->>'model_identifier'),'') is null then
      v_errors:=v_errors || jsonb_build_array('model_identifier is required');
    elsif length(btrim(v_model->>'model_identifier'))>128 then
      v_errors:=v_errors || jsonb_build_array('model_identifier exceeds 128 characters');
    end if;

    if nullif(btrim(v_model->>'manufacturer_name'),'') is null then
      v_errors:=v_errors || jsonb_build_array('manufacturer_name is required');
    elsif length(btrim(v_model->>'manufacturer_name'))>250 then
      v_errors:=v_errors || jsonb_build_array('manufacturer_name exceeds 250 characters');
    end if;

    v_category:=nullif(btrim(v_model->>'category'),'');
    if v_category is null then
      v_errors:=v_errors || jsonb_build_array('category is required');
    elsif v_category<>'light_means_of_transport' then
      v_errors:=v_errors || jsonb_build_array('category must be light_means_of_transport');
    end if;

    if nullif(btrim(v_item->>'unique_identifier'),'') is null then
      v_errors:=v_errors || jsonb_build_array('unique_identifier is required');
    elsif length(btrim(v_item->>'unique_identifier'))>300
       or btrim(v_item->>'unique_identifier') ~ '[[:cntrl:]]' then
      v_errors:=v_errors || jsonb_build_array('unique_identifier must contain 1..300 printable characters');
    elsif exists (
      select 1 from public.dpp_battery_items i
      where i.unique_identifier=btrim(v_item->>'unique_identifier')
    ) then
      v_errors:=v_errors || jsonb_build_array('unique_identifier already exists');
    end if;

    v_lifecycle:=coalesce(nullif(btrim(v_item->>'lifecycle_status'),''),'original');
    if v_lifecycle not in ('original','repurposed','remanufactured','second_life','waste','retired') then
      v_errors:=v_errors || jsonb_build_array('unsupported lifecycle_status');
    end if;

    if jsonb_typeof(coalesce(v_model->'canonical_data','{}'::jsonb))<>'object' then
      v_errors:=v_errors || jsonb_build_array('model canonical_data must be an object');
    end if;
    if jsonb_typeof(coalesce(v_item->'canonical_data','{}'::jsonb))<>'object' then
      v_errors:=v_errors || jsonb_build_array('item canonical_data must be an object');
    end if;

    insert into public.dpp_import_rows(
      import_id,row_number,normalized_model,normalized_item,validation_errors
    ) values (
      v_import_id,
      v_idx,
      v_model,
      v_item,
      v_errors
    );
  end loop;

  return jsonb_build_object(
    'import_id',v_import_id,
    'status','staged',
    'staged_rows',v_idx
  );
end
$fn$;

create or replace function public.dpp_api_import_errors(p_import_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_run public.dpp_import_runs%rowtype;
  v_rows jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select * into v_run
  from public.dpp_import_runs r
  where r.id=p_import_id and r.organization_id=v_org;

  if not found then
    raise exception 'import not found in active organization'
      using errcode='DP001';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'row_number',r.row_number,
      'model_identifier',r.normalized_model->>'model_identifier',
      'unique_identifier',r.normalized_item->>'unique_identifier',
      'validation_errors',r.validation_errors
    ) order by r.row_number
  ) filter (where jsonb_array_length(r.validation_errors)>0),'[]'::jsonb)
  into v_rows
  from public.dpp_import_rows r
  where r.import_id=p_import_id;

  return jsonb_build_object(
    'import_id',v_run.id,
    'status',v_run.status,
    'row_count',v_run.row_count,
    'error_count',v_run.error_count,
    'rows',v_rows
  );
end
$fn$;

revoke all on function public.dpp_api_import_create(jsonb,uuid) from public,anon;
grant execute on function public.dpp_api_import_create(jsonb,uuid) to authenticated;

revoke all on function public.dpp_api_import_errors(uuid) from public,anon;
grant execute on function public.dpp_api_import_errors(uuid) to authenticated;

comment on function public.dpp_api_import_errors(uuid) is
  'Stage 6 tenant-scoped import error report containing row numbers and validation messages only.';
