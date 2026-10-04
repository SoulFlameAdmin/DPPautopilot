-- Stage 9: tenant-safe lifecycle and immutable history projection.

create or replace function public.dpp_api_item_history(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_item public.dpp_battery_items%rowtype;
  v_passport public.dpp_passports%rowtype;
  v_lifecycle jsonb;
  v_versions jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select * into v_item
  from public.dpp_battery_items i
  where i.id=p_item_id and i.organization_id=v_org;
  if not found then
    raise exception 'battery item not found in active organization' using errcode='DP301';
  end if;

  select * into v_passport
  from public.dpp_passports p
  where p.battery_item_id=v_item.id and p.organization_id=v_org
  order by p.created_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'action',a.action,
    'from_status',a.before_data->>'lifecycle_status',
    'to_status',a.after_data->>'lifecycle_status',
    'actor_id',a.actor_id,
    'occurred_at',a.occurred_at
  ) order by a.occurred_at),'[]'::jsonb)
  into v_lifecycle
  from public.dpp_audit_log a
  where a.organization_id=v_org
    and a.target_table='dpp_battery_items'
    and a.target_id=v_item.id
    and (
      a.action='INSERT'
      or coalesce(a.before_data->>'lifecycle_status','') is distinct from coalesce(a.after_data->>'lifecycle_status','')
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'version_no',v.version_no,
    'status',v.status,
    'changed_by',v.changed_by,
    'created_at',v.created_at
  ) order by v.version_no),'[]'::jsonb)
  into v_versions
  from public.dpp_passport_versions v
  where v.organization_id=v_org
    and v.passport_id=v_passport.id;

  return jsonb_build_object(
    'item_id',v_item.id,
    'unique_identifier',v_item.unique_identifier,
    'lifecycle_status',v_item.lifecycle_status,
    'passport_id',v_passport.id,
    'lifecycle_events',v_lifecycle,
    'passport_versions',v_versions
  );
end
$fn$;

revoke all on function public.dpp_api_item_history(uuid) from public,anon;
grant execute on function public.dpp_api_item_history(uuid) to authenticated;

comment on function public.dpp_api_item_history(uuid) is
  'Stage 9 read-only history projection: lifecycle transitions plus passport version metadata; full audit snapshots are not exposed.';
