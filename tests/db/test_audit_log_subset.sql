-- M12 partial DB policy test for immutable critical audit history.
-- M12 remains RED until M03 RBAC and app/API actor enforcement are available.

do $m12$
declare
  v_org uuid := '61616161-6161-4161-8161-616161616161';
  v_actor uuid := '62626262-6262-4262-8262-626262626262';
  v_model uuid := '63636363-6363-4363-8363-636363636363';
  v_import uuid := '64646464-6464-4464-8464-646464646464';
  v_audit_id bigint;
  v_before text;
  v_after text;
  v_seen boolean;
  v_count integer;
  v_source_secret text;
  v_audit_secret text;
  v_nested_secret text;
  v_plain_value text;
begin
  perform set_config('request.jwt.claim.sub',v_actor::text,true);

  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'M12 Audit Org','m12-audit-org');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(
    v_model,v_org,'M12-MODEL','M12 Manufacturer A','electric_vehicle','{}'::jsonb
  );

  update public.dpp_battery_models
  set manufacturer_name='M12 Manufacturer B'
  where id=v_model;

  select id,
         before_data->>'manufacturer_name',
         after_data->>'manufacturer_name'
    into v_audit_id,v_before,v_after
  from public.dpp_audit_log
  where organization_id=v_org
    and actor_id=v_actor
    and action='UPDATE'
    and target_table='dpp_battery_models'
    and target_id=v_model
  order by id desc
  limit 1;

  if v_audit_id is null then
    raise exception 'M12 model UPDATE audit row missing';
  end if;
  if v_before<>'M12 Manufacturer A' or v_after<>'M12 Manufacturer B' then
    raise exception 'M12 before/after snapshot mismatch: before %, after %',v_before,v_after;
  end if;

  -- Secret-like values may exist in flexible source JSON, but the immutable audit copy must redact them.
  update public.dpp_battery_models
  set canonical_data=jsonb_build_object(
    'technical_value','keep-me',
    'api_key','source-api-secret',
    'nested',jsonb_build_object(
      'refresh_token','source-refresh-secret',
      'array',jsonb_build_array(
        jsonb_build_object('client_secret','source-client-secret'),
        jsonb_build_object('safe','visible')
      )
    )
  )
  where id=v_model;

  select canonical_data->>'api_key'
    into v_source_secret
  from public.dpp_battery_models
  where id=v_model;

  select after_data->'canonical_data'->>'api_key',
         after_data->'canonical_data'->'nested'->>'refresh_token',
         after_data->'canonical_data'->>'technical_value'
    into v_audit_secret,v_nested_secret,v_plain_value
  from public.dpp_audit_log
  where organization_id=v_org
    and actor_id=v_actor
    and action='UPDATE'
    and target_table='dpp_battery_models'
    and target_id=v_model
  order by id desc
  limit 1;

  if v_source_secret<>'source-api-secret' then
    raise exception 'M12 audit redaction mutated source row: %',v_source_secret;
  end if;
  if v_audit_secret<>'[REDACTED]' or v_nested_secret<>'[REDACTED]' or v_plain_value<>'keep-me' then
    raise exception 'M12 audit secret redaction mismatch: api %, refresh %, safe %',v_audit_secret,v_nested_secret,v_plain_value;
  end if;
  if exists(
    select 1
    from public.dpp_audit_log
    where organization_id=v_org
      and target_table='dpp_battery_models'
      and target_id=v_model
      and (
        coalesce(before_data::text,'') like '%source-api-secret%'
        or coalesce(after_data::text,'') like '%source-api-secret%'
        or coalesce(before_data::text,'') like '%source-refresh-secret%'
        or coalesce(after_data::text,'') like '%source-refresh-secret%'
        or coalesce(before_data::text,'') like '%source-client-secret%'
        or coalesce(after_data::text,'') like '%source-client-secret%'
      )
  ) then
    raise exception 'M12 secret-like source value leaked into immutable audit snapshot';
  end if;

  insert into public.dpp_import_runs(id,organization_id,status)
  values(v_import,v_org,'staged');

  delete from public.dpp_import_runs where id=v_import;

  select count(*) into v_count
  from public.dpp_audit_log
  where organization_id=v_org
    and actor_id=v_actor
    and action='DELETE'
    and target_table='dpp_import_runs'
    and target_id=v_import
    and before_data is not null
    and after_data is null;

  if v_count<>1 then
    raise exception 'M12 DELETE audit expected exactly one row, got %',v_count;
  end if;

  v_seen:=false;
  begin
    update public.dpp_audit_log
    set action='DELETE'
    where id=v_audit_id;
  exception when sqlstate '55000' then
    v_seen:=true;
  end;
  if not v_seen then
    raise exception 'M12 audit UPDATE mutation was not rejected';
  end if;

  v_seen:=false;
  begin
    delete from public.dpp_audit_log where id=v_audit_id;
  exception when sqlstate '55000' then
    v_seen:=true;
  end;
  if not v_seen then
    raise exception 'M12 audit DELETE mutation was not rejected';
  end if;

  if has_function_privilege('anon','public.dpp_redact_audit_json(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.dpp_redact_audit_json(jsonb)','EXECUTE') then
    raise exception 'M12 audit redaction helper leaked direct client EXECUTE';
  end if;

  if has_table_privilege('anon','public.dpp_audit_log','SELECT')
     or has_table_privilege('anon','public.dpp_audit_log','INSERT')
     or has_table_privilege('anon','public.dpp_audit_log','UPDATE')
     or has_table_privilege('anon','public.dpp_audit_log','DELETE')
     or has_table_privilege('authenticated','public.dpp_audit_log','SELECT')
     or has_table_privilege('authenticated','public.dpp_audit_log','INSERT')
     or has_table_privilege('authenticated','public.dpp_audit_log','UPDATE')
     or has_table_privilege('authenticated','public.dpp_audit_log','DELETE') then
    raise exception 'M12 audit table leaked direct anon/authenticated privileges';
  end if;
end
$m12$;

select 'M12_AUDIT_LOG_SUBSET_PASS' as result;
