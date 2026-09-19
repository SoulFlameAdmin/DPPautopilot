-- M23 optimistic concurrency hardening for model/item/passport PATCH writes.
-- Authenticated clients must use checked update RPCs with the updated_at value they last read.

create or replace function public.dpp_api_models_update_checked(
  p_id uuid,
  p_model_identifier text default null,
  p_manufacturer_name text default null,
  p_category text default null,
  p_canonical_data jsonb default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_actual timestamptz;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  select m.updated_at into v_actual
  from public.dpp_battery_models m
  where m.id=p_id and m.organization_id=v_org
  for update;

  if not found then
    raise exception 'model not found in active organization' using errcode='DP205';
  end if;
  if p_expected_updated_at is null or v_actual is distinct from p_expected_updated_at then
    raise exception 'model changed since it was read' using errcode='DP206';
  end if;

  return public.dpp_api_models_update(
    p_id,p_model_identifier,p_manufacturer_name,p_category,p_canonical_data
  );
end
$fn$;

create or replace function public.dpp_api_items_update_checked(
  p_id uuid,
  p_model_id uuid default null,
  p_unique_identifier text default null,
  p_lifecycle_status text default null,
  p_canonical_data jsonb default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_actual timestamptz;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  select i.updated_at into v_actual
  from public.dpp_battery_items i
  where i.id=p_id and i.organization_id=v_org
  for update;

  if not found then
    raise exception 'item not found in active organization' using errcode='DP306';
  end if;
  if p_expected_updated_at is null or v_actual is distinct from p_expected_updated_at then
    raise exception 'item changed since it was read' using errcode='DP309';
  end if;

  return public.dpp_api_items_update(
    p_id,p_model_id,p_unique_identifier,p_lifecycle_status,p_canonical_data
  );
end
$fn$;

create or replace function public.dpp_api_passport_update_checked(
  p_id uuid,
  p_status text default null,
  p_public_payload jsonb default null,
  p_private_payload jsonb default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_actual timestamptz;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  select p.updated_at into v_actual
  from public.dpp_passports p
  where p.id=p_id and p.organization_id=v_org
  for update;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;
  if p_expected_updated_at is null or v_actual is distinct from p_expected_updated_at then
    raise exception 'passport changed since it was read' using errcode='DP411';
  end if;

  return public.dpp_api_passport_update(
    p_id,p_status,p_public_payload,p_private_payload
  );
end
$fn$;

-- Prevent authenticated clients from bypassing optimistic concurrency through PostgREST RPC.
revoke execute on function public.dpp_api_models_update(uuid,text,text,text,jsonb) from authenticated;
revoke execute on function public.dpp_api_items_update(uuid,uuid,text,text,jsonb) from authenticated;
revoke execute on function public.dpp_api_passport_update(uuid,text,jsonb,jsonb) from authenticated;

revoke all on function public.dpp_api_models_update_checked(uuid,text,text,text,jsonb,timestamptz) from public,anon;
revoke all on function public.dpp_api_items_update_checked(uuid,uuid,text,text,jsonb,timestamptz) from public,anon;
revoke all on function public.dpp_api_passport_update_checked(uuid,text,jsonb,jsonb,timestamptz) from public,anon;

grant execute on function public.dpp_api_models_update_checked(uuid,text,text,text,jsonb,timestamptz) to authenticated;
grant execute on function public.dpp_api_items_update_checked(uuid,uuid,text,text,jsonb,timestamptz) to authenticated;
grant execute on function public.dpp_api_passport_update_checked(uuid,text,jsonb,jsonb,timestamptz) to authenticated;

comment on function public.dpp_api_models_update_checked(uuid,text,text,text,jsonb,timestamptz) is
  'M23 optimistic concurrency model update; stale updated_at is rejected.';
comment on function public.dpp_api_items_update_checked(uuid,uuid,text,text,jsonb,timestamptz) is
  'M23 optimistic concurrency item update; stale updated_at is rejected.';
comment on function public.dpp_api_passport_update_checked(uuid,text,jsonb,jsonb,timestamptz) is
  'M23 optimistic concurrency passport update; stale updated_at is rejected.';
