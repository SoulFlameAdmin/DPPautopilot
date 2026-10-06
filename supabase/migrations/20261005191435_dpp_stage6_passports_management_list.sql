
create or replace function public.dpp_api_passports_list(p_limit integer default 250)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_result jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'passport list limit must be 1..500' using errcode='DP417';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'passport_id',x.passport_id,
      'battery_item_id',x.battery_item_id,
      'unique_identifier',x.unique_identifier,
      'status',x.status,
      'created_at',x.created_at,
      'updated_at',x.updated_at
    )
    order by x.updated_at desc,x.passport_id
  ),'[]'::jsonb)
  into v_result
  from (
    select p.id as passport_id,p.battery_item_id,i.unique_identifier,p.status,p.created_at,p.updated_at
    from public.dpp_passports p
    join public.dpp_battery_items i
      on i.organization_id=p.organization_id
     and i.id=p.battery_item_id
    where p.organization_id=v_org
    order by p.updated_at desc,p.id
    limit p_limit
  ) x;

  return v_result;
end
$fn$;

revoke all on function public.dpp_api_passports_list(integer) from public,anon;
grant execute on function public.dpp_api_passports_list(integer) to authenticated;

do $grant$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.dpp_api_passports_list(integer) to service_role';
  end if;
end
$grant$;

create index if not exists dpp_passports_org_updated_idx
  on public.dpp_passports(organization_id,updated_at desc,id);

comment on function public.dpp_api_passports_list(integer) is
  'Tenant-scoped production passport management list without private payload leakage.';
