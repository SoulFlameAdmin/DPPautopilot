-- M23 partial idempotency/concurrency coverage for GREEN M20 transactional imports.
-- M23 remains RED until M17-M19 API flows are implemented and covered.

do $m23$
declare
  v_org uuid := '67676767-6767-4676-8676-676767676767';
  v_import uuid := '78787878-7878-4787-8787-787878787878';
  v_first jsonb;
  v_second jsonb;
  v_items integer;
  v_models integer;
  v_links integer;
begin
  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'M23 Import Idempotency','m23-import-idempotency');

  insert into public.dpp_import_runs(id,organization_id,status)
  values(v_import,v_org,'staged');

  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values(
    v_import,1,
    '{"model_identifier":"M23-MODEL","manufacturer_name":"M23 Manufacturer","category":"electric_vehicle","canonical_data":{}}'::jsonb,
    '{"unique_identifier":"urn:dpp:m23:000001","lifecycle_status":"original","canonical_data":{}}'::jsonb,
    '[]'::jsonb
  );

  perform public.dpp_validate_import(v_import);
  v_first:=public.dpp_commit_import(v_import);
  v_second:=public.dpp_commit_import(v_import);

  if coalesce((v_first->>'already_committed')::boolean,true) then
    raise exception 'M23 first commit incorrectly reported already_committed';
  end if;

  if not coalesce((v_second->>'already_committed')::boolean,false) then
    raise exception 'M23 second commit did not report already_committed';
  end if;

  if (v_first->>'committed_rows')::int<>1 or (v_second->>'committed_rows')::int<>1 then
    raise exception 'M23 committed row count changed across duplicate commit';
  end if;

  select count(*) into v_items
  from public.dpp_battery_items
  where organization_id=v_org and unique_identifier='urn:dpp:m23:000001';

  select count(*) into v_models
  from public.dpp_battery_models
  where organization_id=v_org and model_identifier='M23-MODEL';

  select count(*) into v_links
  from public.dpp_import_rows
  where import_id=v_import
    and committed_model_id is not null
    and committed_item_id is not null;

  if v_items<>1 or v_models<>1 or v_links<>1 then
    raise exception 'M23 duplicate commit produced duplicate/inconsistent state: items %, models %, links %',
      v_items,v_models,v_links;
  end if;
end
$m23$;

select 'M23_IMPORT_IDEMPOTENCY_SUBSET_PASS' as result;
