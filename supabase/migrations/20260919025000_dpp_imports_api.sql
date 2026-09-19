-- M20 HTTP/API hardening: tenant/RBAC-scoped import RPC facade.
-- Internal dpp_validate_import/dpp_commit_import remain non-executable by authenticated callers.

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

    if jsonb_typeof(v_row)<>'object'
       or jsonb_typeof(v_row->'normalized_model')<>'object'
       or jsonb_typeof(v_row->'normalized_item')<>'object' then
      raise exception 'import row % must contain normalized_model and normalized_item objects',v_idx
        using errcode='DP009';
    end if;

    v_errors:=coalesce(v_row->'validation_errors','[]'::jsonb);
    if jsonb_typeof(v_errors)<>'array' then
      raise exception 'import row % validation_errors must be an array',v_idx
        using errcode='DP009';
    end if;

    insert into public.dpp_import_rows(
      import_id,row_number,normalized_model,normalized_item,validation_errors
    ) values (
      v_import_id,
      v_idx,
      v_row->'normalized_model',
      v_row->'normalized_item',
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

create or replace function public.dpp_api_import_get(p_import_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_run public.dpp_import_runs%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select *
  into v_run
  from public.dpp_import_runs r
  where r.id=p_import_id
    and r.organization_id=v_org;

  if not found then
    raise exception 'import not found in active organization'
      using errcode='DP001';
  end if;

  return jsonb_build_object(
    'import_id',v_run.id,
    'mapping_id',v_run.mapping_id,
    'status',v_run.status,
    'row_count',v_run.row_count,
    'error_count',v_run.error_count,
    'validated_at',v_run.validated_at,
    'committed_at',v_run.committed_at,
    'created_at',v_run.created_at,
    'updated_at',v_run.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_import_validate(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  if not exists (
    select 1 from public.dpp_import_runs r
    where r.id=p_import_id and r.organization_id=v_org
  ) then
    raise exception 'import not found in active organization'
      using errcode='DP001';
  end if;

  return public.dpp_validate_import(p_import_id);
end
$fn$;

create or replace function public.dpp_api_import_commit(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  if not exists (
    select 1 from public.dpp_import_runs r
    where r.id=p_import_id and r.organization_id=v_org
  ) then
    raise exception 'import not found in active organization'
      using errcode='DP001';
  end if;

  return public.dpp_commit_import(p_import_id);
end
$fn$;

revoke all on function public.dpp_api_import_create(jsonb,uuid) from public,anon;
revoke all on function public.dpp_api_import_get(uuid) from public,anon;
revoke all on function public.dpp_api_import_validate(uuid) from public,anon;
revoke all on function public.dpp_api_import_commit(uuid) from public,anon;

grant execute on function public.dpp_api_import_create(jsonb,uuid) to authenticated;
grant execute on function public.dpp_api_import_get(uuid) to authenticated;
grant execute on function public.dpp_api_import_validate(uuid) to authenticated;
grant execute on function public.dpp_api_import_commit(uuid) to authenticated;

comment on function public.dpp_api_import_create(jsonb,uuid) is
  'M20 API facade: stage normalized import rows only inside the explicit active DPP tenant.';
comment on function public.dpp_api_import_get(uuid) is
  'M20 API facade: read one import status only from the explicit active DPP tenant.';
comment on function public.dpp_api_import_validate(uuid) is
  'M20 API facade: validate one active-tenant import using the internal transactional import contract.';
comment on function public.dpp_api_import_commit(uuid) is
  'M20 API facade: atomically commit one active-tenant import using the internal transactional import contract.';
