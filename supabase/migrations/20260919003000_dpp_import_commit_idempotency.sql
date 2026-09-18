-- M23 partial: make M20 import commit idempotent while preserving row-lock serialization.
-- Repeated commit of an already committed import becomes a validated no-op.
-- Inconsistent committed state still fails closed.

create or replace function public.dpp_commit_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_run public.dpp_import_runs%rowtype;
  v_row record;
  v_model_id uuid;
  v_item_id uuid;
  v_committed integer := 0;
begin
  select * into v_run
  from public.dpp_import_runs
  where id=p_import_id
  for update;

  if not found then
    raise exception 'import % not found',p_import_id using errcode='P0002';
  end if;

  if v_run.status='committed' then
    select count(*) into v_committed
    from public.dpp_import_rows
    where import_id=p_import_id
      and committed_model_id is not null
      and committed_item_id is not null;

    if v_committed<>v_run.row_count then
      raise exception 'import % committed state is inconsistent (linked rows %, expected %)',
        p_import_id,v_committed,v_run.row_count
        using errcode='23514';
    end if;

    return jsonb_build_object(
      'import_id',p_import_id,
      'status','committed',
      'committed_rows',v_committed,
      'already_committed',true
    );
  end if;

  if v_run.status <> 'validated' or v_run.error_count <> 0 then
    raise exception 'import % is not valid for commit (status %, errors %)',p_import_id,v_run.status,v_run.error_count
      using errcode='23514';
  end if;

  for v_row in
    select *
    from public.dpp_import_rows
    where import_id=p_import_id
    order by row_number
  loop
    if jsonb_array_length(v_row.validation_errors) <> 0 then
      raise exception 'import % row % contains validation errors',p_import_id,v_row.row_number
        using errcode='23514';
    end if;

    if nullif(btrim(v_row.normalized_model->>'model_identifier'),'') is null
       or nullif(btrim(v_row.normalized_model->>'manufacturer_name'),'') is null
       or nullif(btrim(v_row.normalized_model->>'category'),'') is null
       or nullif(btrim(v_row.normalized_item->>'unique_identifier'),'') is null then
      raise exception 'import % row % missing normalized identity fields',p_import_id,v_row.row_number
        using errcode='23514';
    end if;

    insert into public.dpp_battery_models(
      organization_id,model_identifier,manufacturer_name,category,canonical_data,created_by
    ) values (
      v_run.organization_id,
      v_row.normalized_model->>'model_identifier',
      v_row.normalized_model->>'manufacturer_name',
      v_row.normalized_model->>'category',
      coalesce(v_row.normalized_model->'canonical_data','{}'::jsonb),
      v_run.created_by
    )
    on conflict (organization_id,model_identifier) do update
    set manufacturer_name=excluded.manufacturer_name,
        category=excluded.category,
        canonical_data=excluded.canonical_data,
        updated_at=now()
    returning id into v_model_id;

    insert into public.dpp_battery_items(
      organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by
    ) values (
      v_run.organization_id,
      v_model_id,
      v_row.normalized_item->>'unique_identifier',
      coalesce(nullif(v_row.normalized_item->>'lifecycle_status',''),'original'),
      coalesce(v_row.normalized_item->'canonical_data','{}'::jsonb),
      v_run.created_by
    )
    returning id into v_item_id;

    update public.dpp_import_rows
    set committed_model_id=v_model_id,
        committed_item_id=v_item_id
    where import_id=p_import_id and row_number=v_row.row_number;

    v_committed := v_committed + 1;
  end loop;

  if v_committed <> v_run.row_count then
    raise exception 'import % committed rows % do not match validated row_count %',p_import_id,v_committed,v_run.row_count
      using errcode='23514';
  end if;

  update public.dpp_import_runs
  set status='committed',committed_at=now(),updated_at=now()
  where id=p_import_id;

  return jsonb_build_object(
    'import_id',p_import_id,
    'status','committed',
    'committed_rows',v_committed,
    'already_committed',false
  );
end
$fn$;

revoke all on function public.dpp_commit_import(uuid) from public,anon,authenticated;
