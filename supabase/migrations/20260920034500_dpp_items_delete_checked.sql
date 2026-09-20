-- M18/M23 hardening: optimistic concurrency for item DELETE.
-- Authenticated clients must prove the updated_at value last observed before deletion.

create or replace function public.dpp_api_items_delete_checked(
  p_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_actual timestamptz;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);

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

  return public.dpp_api_items_delete(p_id);
end
$fn$;

revoke execute on function public.dpp_api_items_delete(uuid) from authenticated;
revoke all on function public.dpp_api_items_delete_checked(uuid,timestamptz) from public,anon;
grant execute on function public.dpp_api_items_delete_checked(uuid,timestamptz) to authenticated;

comment on function public.dpp_api_items_delete_checked(uuid,timestamptz) is
  'M18/M23 optimistic concurrency item delete; stale updated_at is rejected.';
