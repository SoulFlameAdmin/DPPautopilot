-- M20: transactional import create/validate/commit flow.
-- Staging rows are tenant-scoped and commit is all-or-nothing inside one PostgreSQL function call.

create table public.dpp_import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  mapping_id uuid null,
  status text not null default 'staged' check (status in ('staged','validated','invalid','committed')),
  row_count integer not null default 0 check (row_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_by uuid null references auth.users(id) on delete set null,
  validated_at timestamptz null,
  committed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint dpp_import_runs_org_mapping_fk
    foreign key (organization_id,mapping_id)
    references public.dpp_import_mappings(organization_id,id)
    on delete set null
);

create table public.dpp_import_rows (
  import_id uuid not null references public.dpp_import_runs(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  normalized_model jsonb not null check (jsonb_typeof(normalized_model)='object'),
  normalized_item jsonb not null check (jsonb_typeof(normalized_item)='object'),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors)='array'),
  committed_model_id uuid null references public.dpp_battery_models(id) on delete set null,
  committed_item_id uuid null references public.dpp_battery_items(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (import_id,row_number)
);

alter table public.dpp_import_runs enable row level security;
alter table public.dpp_import_rows enable row level security;
revoke all on table public.dpp_import_runs from anon,authenticated;
revoke all on table public.dpp_import_rows from anon,authenticated;

create or replace function public.dpp_validate_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_rows integer;
  v_errors integer;
  v_status text;
begin
  select count(*),
         coalesce(sum(jsonb_array_length(validation_errors)),0)
    into v_rows,v_errors
  from public.dpp_import_rows
  where import_id=p_import_id;

  if v_rows=0 then
    raise exception 'import % has no staged rows',p_import_id using errcode='23514';
  end if;

  v_status := case when v_errors=0 then 'validated' else 'invalid' end;

  update public.dpp_import_runs
  set status=v_status,
      row_count=v_rows,
      error_count=v_errors,
      validated_at=now(),
      updated_at=now()
  where id=p_import_id;

  if not found then
    raise exception 'import % not found',p_import_id using errcode='P0002';
  end if;

  return jsonb_build_object('import_id',p_import_id,'status',v_status,'row_count',v_rows,'error_count',v_errors);
end
$fn$;

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

  return jsonb_build_object('import_id',p_import_id,'status','committed','committed_rows',v_committed);
end
$fn$;

revoke all on function public.dpp_validate_import(uuid) from public,anon,authenticated;
revoke all on function public.dpp_commit_import(uuid) from public,anon,authenticated;
