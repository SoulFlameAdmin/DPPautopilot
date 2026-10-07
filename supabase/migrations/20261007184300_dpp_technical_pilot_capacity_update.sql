create or replace function public.dpp_api_technical_pilot_update_capacity(
  p_id uuid,
  p_capacity_ah numeric,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_org uuid;
  v_passport public.dpp_passports%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  if p_id is null then
    raise exception 'passport id is required' using errcode='DP403';
  end if;
  if p_capacity_ah is null or p_capacity_ah<=0 or p_capacity_ah>100000 then
    raise exception 'capacity_ah is invalid' using errcode='DP406';
  end if;

  select *
    into v_passport
  from public.dpp_passports p
  where p.id=p_id and p.organization_id=v_org
  for update;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;
  if p_expected_updated_at is null or v_passport.updated_at is distinct from p_expected_updated_at then
    raise exception 'passport changed since it was read' using errcode='DP411';
  end if;
  if v_passport.status<>'active' then
    raise exception 'technical pilot passport must be active' using errcode='DP610';
  end if;
  if coalesce(v_passport.public_payload#>>'{pilot,mode}','')<>'technical_pilot'
     or coalesce((v_passport.public_payload#>'{pilot,regulatory_compliance}')::text,'')<>'false' then
    raise exception 'passport is not an active technical pilot' using errcode='DP409';
  end if;

  update public.dpp_passports p
  set public_payload=jsonb_set(
        coalesce(p.public_payload,'{}'::jsonb),
        '{model,rated_capacity_ah}',
        to_jsonb(p_capacity_ah),
        true
      ),
      updated_at=clock_timestamp()
  where p.id=p_id and p.organization_id=v_org
  returning * into v_passport;

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'battery_item_id',v_passport.battery_item_id,
    'status',v_passport.status,
    'public_payload',v_passport.public_payload,
    'private_payload',v_passport.private_payload,
    'created_at',v_passport.created_at,
    'updated_at',v_passport.updated_at
  );
end
$$;

revoke all on function public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamptz) from public;
grant execute on function public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamptz) to authenticated;
