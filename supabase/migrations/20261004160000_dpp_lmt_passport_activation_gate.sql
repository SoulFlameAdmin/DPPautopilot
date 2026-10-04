-- Step 18: fail-closed LMT passport activation gate.
-- Provisioning creates DRAFT passports. ACTIVE status is reachable only through
-- a server-side readiness check covering the 18-Feb-2027 LMT launch contract.

create table if not exists public.dpp_authority_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  model_id uuid not null references public.dpp_battery_models(id) on delete cascade,
  field_number integer not null check (field_number between 1 and 71),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,model_id,field_number)
);

create index if not exists dpp_authority_evidence_org_model_idx
  on public.dpp_authority_evidence(organization_id,model_id,field_number);

alter table public.dpp_authority_evidence enable row level security;
revoke all on public.dpp_authority_evidence from public,anon,authenticated;

create or replace function public.dpp_json_path_has_value(
  p_doc jsonb,
  p_path text[]
)
returns boolean
language sql
immutable
security invoker
set search_path=public,pg_temp
as $fn$
  select case
    when p_doc is null then false
    when p_doc #> p_path is null then false
    when jsonb_typeof(p_doc #> p_path)='null' then false
    when jsonb_typeof(p_doc #> p_path)='string' then length(btrim(p_doc #>> p_path))>0
    else true
  end
$fn$;

revoke all on function public.dpp_json_path_has_value(jsonb,text[]) from public,anon,authenticated;

create or replace function public.dpp_api_scooter_passport_readiness(
  p_passport_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_passport public.dpp_passports%rowtype;
  v_item public.dpp_battery_items%rowtype;
  v_model public.dpp_battery_models%rowtype;
  v_model_data jsonb;
  v_item_data jsonb;
  v_public jsonb;
  v_model_app jsonb;
  v_item_app jsonb;
  v_missing integer[] := array[]::integer[];
  v_undecided integer[] := array[]::integer[];
  v_has50 boolean := false;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select p.* into v_passport
  from public.dpp_passports p
  where p.id=p_passport_id and p.organization_id=v_org;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;

  select i.* into v_item
  from public.dpp_battery_items i
  where i.id=v_passport.battery_item_id and i.organization_id=v_org;

  if not found then
    raise exception 'battery item not found in active organization' using errcode='DP405';
  end if;

  select m.* into v_model
  from public.dpp_battery_models m
  where m.id=v_item.model_id and m.organization_id=v_org;

  if not found then
    raise exception 'battery model not found in active organization' using errcode='DP601';
  end if;
  if v_model.category<>'light_means_of_transport' then
    raise exception 'battery model is not an LMT model' using errcode='DP602';
  end if;

  v_model_data:=coalesce(v_model.canonical_data,'{}'::jsonb);
  v_item_data:=coalesce(v_item.canonical_data,'{}'::jsonb);
  v_public:=coalesce(v_passport.public_payload,'{}'::jsonb);
  v_model_app:=coalesce(v_model_data->'point_applicability','{}'::jsonb);
  v_item_app:=coalesce(v_item_data->'point_applicability','{}'::jsonb);

  -- Individual/public identity.
  if length(btrim(coalesce(v_item.unique_identifier,'')))=0 then v_missing:=array_append(v_missing,1); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['responsible_economic_operator']) then v_missing:=array_append(v_missing,2); end if;

  -- Mandatory model-level launch points.
  if not public.dpp_json_path_has_value(v_model_data,array['identification','manufacturer','name']) then v_missing:=array_append(v_missing,3); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['identification','manufacturer','postal_address']) then v_missing:=array_append(v_missing,4); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['identification','category']) then v_missing:=array_append(v_missing,6); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['identification','model_id']) then v_missing:=array_append(v_missing,7); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['identification','place_of_manufacture']) then v_missing:=array_append(v_missing,8); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['identification','date_of_manufacture']) then v_missing:=array_append(v_missing,9); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['physical','weight_kg']) then v_missing:=array_append(v_missing,10); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['rated_capacity_ah']) then v_missing:=array_append(v_missing,11); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['composition','chemistry']) then v_missing:=array_append(v_missing,12); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['composition','hazardous_substances']) then v_missing:=array_append(v_missing,13); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['safety','usable_extinguishing_agent']) then v_missing:=array_append(v_missing,14); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['composition','critical_raw_materials']) then v_missing:=array_append(v_missing,15); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['renewable_content_share']) then v_missing:=array_append(v_missing,24); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['voltage','minimum_v']) then v_missing:=array_append(v_missing,26); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['voltage','nominal_v']) then v_missing:=array_append(v_missing,27); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['voltage','maximum_v']) then v_missing:=array_append(v_missing,28); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['power_capability','original_w']) then v_missing:=array_append(v_missing,29); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['power_capability','limits']) then v_missing:=array_append(v_missing,30); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['expected_lifetime','cycles']) then v_missing:=array_append(v_missing,31); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['expected_lifetime','reference_test']) then v_missing:=array_append(v_missing,32); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['storage_temperature']) then v_missing:=array_append(v_missing,34); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['energy_efficiency','initial_round_trip_pct']) then v_missing:=array_append(v_missing,36); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['energy_efficiency','at_50_percent_cycle_life_pct']) then v_missing:=array_append(v_missing,37); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['internal_resistance']) then v_missing:=array_append(v_missing,38); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['c_rate_test']) then v_missing:=array_append(v_missing,39); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['markings','article_13_4']) then v_missing:=array_append(v_missing,40); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['eu_declaration_of_conformity']) then v_missing:=array_append(v_missing,42); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['waste_information']) then v_missing:=array_append(v_missing,43); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['restricted_composition']) then v_missing:=array_append(v_missing,45); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['spares','part_numbers']) then v_missing:=array_append(v_missing,46); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['spares','source_contacts']) then v_missing:=array_append(v_missing,47); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['disassembly']) then v_missing:=array_append(v_missing,48); end if;
  if not public.dpp_json_path_has_value(v_model_data,array['safety_measures']) then v_missing:=array_append(v_missing,49); end if;

  select exists(
    select 1 from public.dpp_authority_evidence e
    where e.organization_id=v_org
      and e.model_id=v_model.id
      and e.field_number=50
      and jsonb_typeof(e.evidence)='object'
  ) into v_has50;
  if not v_has50 then v_missing:=array_append(v_missing,50); end if;

  -- Mandatory individual-battery launch points.
  if not public.dpp_json_path_has_value(v_item_data,array['performance','rated_capacity_ah']) then v_missing:=array_append(v_missing,51); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['performance','capacity_fade_pct']) then v_missing:=array_append(v_missing,52); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['performance','power_w']) then v_missing:=array_append(v_missing,53); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['performance','power_fade_pct']) then v_missing:=array_append(v_missing,54); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['performance','internal_resistance_ohm']) then v_missing:=array_append(v_missing,55); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['performance','internal_resistance_increase_pct']) then v_missing:=array_append(v_missing,56); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['performance','expected_lifetime_cycles']) then v_missing:=array_append(v_missing,59); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['performance','expected_lifetime_calendar_years']) then v_missing:=array_append(v_missing,60); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['state_of_health','remaining_capacity']) then v_missing:=array_append(v_missing,62); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['state_of_health','remaining_power_capability']) then v_missing:=array_append(v_missing,63); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['state_of_health','remaining_round_trip_efficiency']) then v_missing:=array_append(v_missing,64); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['state_of_health','self_discharge_rate']) then v_missing:=array_append(v_missing,65); end if;
  if not public.dpp_json_path_has_value(v_item_data,array['state_of_health','ohmic_resistance']) then v_missing:=array_append(v_missing,66); end if;
  if length(btrim(coalesce(v_item.lifecycle_status,'')))=0 then v_missing:=array_append(v_missing,67); end if;

  -- Conditional launch points require an explicit true/false decision.
  if not (v_model_app ? '35') or jsonb_typeof(v_model_app->'35')<>'boolean' then
    v_undecided:=array_append(v_undecided,35);
  elsif (v_model_app->>'35')::boolean and not public.dpp_json_path_has_value(v_model_data,array['warranty_calendar_life']) then
    v_missing:=array_append(v_missing,35);
  end if;

  if not (v_model_app ? '41') or jsonb_typeof(v_model_app->'41')<>'boolean' then
    v_undecided:=array_append(v_undecided,41);
  elsif (v_model_app->>'41')::boolean and not public.dpp_json_path_has_value(v_model_data,array['markings','article_13_5']) then
    v_missing:=array_append(v_missing,41);
  end if;

  if not (v_item_app ? '57') or jsonb_typeof(v_item_app->'57')<>'boolean' then
    v_undecided:=array_append(v_undecided,57);
  elsif (v_item_app->>'57')::boolean and not public.dpp_json_path_has_value(v_item_data,array['performance','round_trip_efficiency_pct']) then
    v_missing:=array_append(v_missing,57);
  end if;

  if not (v_item_app ? '58') or jsonb_typeof(v_item_app->'58')<>'boolean' then
    v_undecided:=array_append(v_undecided,58);
  elsif (v_item_app->>'58')::boolean and not public.dpp_json_path_has_value(v_item_data,array['performance','round_trip_efficiency_fade_pct']) then
    v_missing:=array_append(v_missing,58);
  end if;

  if not (v_item_app ? '68') or jsonb_typeof(v_item_app->'68')<>'boolean' then
    v_undecided:=array_append(v_undecided,68);
  elsif (v_item_app->>'68')::boolean and not public.dpp_json_path_has_value(v_item_data,array['usage','cycles']) then
    v_missing:=array_append(v_missing,68);
  end if;

  if not (v_item_app ? '69') or jsonb_typeof(v_item_app->'69')<>'boolean' then
    v_undecided:=array_append(v_undecided,69);
  elsif (v_item_app->>'69')::boolean and not public.dpp_json_path_has_value(v_item_data,array['usage','events']) then
    v_missing:=array_append(v_missing,69);
  end if;

  if not (v_item_app ? '70') or jsonb_typeof(v_item_app->'70')<>'boolean' then
    v_undecided:=array_append(v_undecided,70);
  elsif (v_item_app->>'70')::boolean and not public.dpp_json_path_has_value(v_item_data,array['telemetry','environment']) then
    v_missing:=array_append(v_missing,70);
  end if;

  if not (v_item_app ? '71') or jsonb_typeof(v_item_app->'71')<>'boolean' then
    v_undecided:=array_append(v_undecided,71);
  elsif (v_item_app->>'71')::boolean and not public.dpp_json_path_has_value(v_item_data,array['telemetry','state_of_charge']) then
    v_missing:=array_append(v_missing,71);
  end if;

  return jsonb_build_object(
    'passport_id',v_passport.id,
    'battery_item_id',v_item.id,
    'model_id',v_model.id,
    'unique_identifier',v_item.unique_identifier,
    'status',v_passport.status,
    'schema_version','2.0.0-lmt-2026-10-04',
    'missing_points',to_jsonb(v_missing),
    'undecided_conditional_points',to_jsonb(v_undecided),
    'missing_count',cardinality(v_missing),
    'undecided_count',cardinality(v_undecided),
    'ready',cardinality(v_missing)=0 and cardinality(v_undecided)=0
  );
end
$fn$;

revoke all on function public.dpp_api_scooter_passport_readiness(uuid) from public,anon;
grant execute on function public.dpp_api_scooter_passport_readiness(uuid) to authenticated;

create or replace function public.dpp_api_scooter_passport_activate(
  p_passport_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_passport public.dpp_passports%rowtype;
  v_report jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  select p.* into v_passport
  from public.dpp_passports p
  where p.id=p_passport_id and p.organization_id=v_org
  for update;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;
  if p_expected_updated_at is null or v_passport.updated_at is distinct from p_expected_updated_at then
    raise exception 'passport changed since it was read' using errcode='DP411';
  end if;
  if v_passport.status='active' then
    return public.dpp_api_passport_private(v_passport.id);
  end if;
  if v_passport.status not in ('draft','suspended') then
    raise exception 'passport state cannot be activated' using errcode='DP611';
  end if;

  v_report:=public.dpp_api_scooter_passport_readiness(v_passport.id);
  if coalesce((v_report->>'undecided_count')::integer,0)>0 then
    raise exception 'conditional applicability decisions are incomplete' using errcode='DP609';
  end if;
  if not coalesce((v_report->>'ready')::boolean,false) then
    raise exception 'passport does not satisfy LMT launch readiness' using errcode='DP608';
  end if;

  update public.dpp_passports
  set status='active',updated_at=now()
  where id=v_passport.id and organization_id=v_org
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
$fn$;

revoke all on function public.dpp_api_scooter_passport_activate(uuid,timestamptz) from public,anon;
grant execute on function public.dpp_api_scooter_passport_activate(uuid,timestamptz) to authenticated;

-- Direct generic PATCH may update content/statuses but cannot promote a non-active
-- passport to ACTIVE. This prevents bypassing the LMT readiness gate.
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
  v_current_status text;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);

  select p.updated_at,p.status
  into v_actual,v_current_status
  from public.dpp_passports p
  where p.id=p_id and p.organization_id=v_org
  for update;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;
  if p_expected_updated_at is null or v_actual is distinct from p_expected_updated_at then
    raise exception 'passport changed since it was read' using errcode='DP411';
  end if;
  if p_status='active' and v_current_status<>'active' then
    raise exception 'active transition requires readiness activation route' using errcode='DP610';
  end if;

  return public.dpp_api_passport_update(
    p_id,p_status,p_public_payload,p_private_payload
  );
end
$fn$;

revoke all on function public.dpp_api_passport_update_checked(uuid,text,jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.dpp_api_passport_update_checked(uuid,text,jsonb,jsonb,timestamptz) to authenticated;

-- Replace Stage 4 provisioning semantics: item + passport are still atomic/idempotent,
-- but the passport begins in DRAFT and must pass the readiness gate before public release.
create or replace function public.dpp_api_scooter_battery_provision(
  p_model_id uuid,
  p_unique_identifier text,
  p_item_canonical_data jsonb default '{}'::jsonb,
  p_public_payload jsonb default '{}'::jsonb,
  p_private_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_identifier text;
  v_model public.dpp_battery_models%rowtype;
  v_item public.dpp_battery_items%rowtype;
  v_passport public.dpp_passports%rowtype;
  v_created_item boolean := false;
  v_created_passport boolean := false;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_model_id is null then raise exception 'model_id is required' using errcode='DP603'; end if;
  v_identifier:=btrim(coalesce(p_unique_identifier,''));
  if length(v_identifier) not between 1 and 300 or v_identifier ~ '[[:cntrl:]]' then
    raise exception 'unique_identifier must contain 1..300 printable characters' using errcode='DP603';
  end if;
  if p_item_canonical_data is null or jsonb_typeof(p_item_canonical_data)<>'object'
     or p_public_payload is null or jsonb_typeof(p_public_payload)<>'object'
     or p_private_payload is null or jsonb_typeof(p_private_payload)<>'object' then
    raise exception 'provisioning payloads must be JSON objects' using errcode='DP603';
  end if;

  select m.* into v_model
  from public.dpp_battery_models m
  where m.id=p_model_id and m.organization_id=v_org
  for share;

  if not found then raise exception 'battery model not found in active organization' using errcode='DP601'; end if;
  if v_model.category<>'light_means_of_transport' then raise exception 'battery model is not an LMT model' using errcode='DP602'; end if;

  if p_public_payload#>>'{item,unique_identifier}' is null
     or p_public_payload#>>'{item,unique_identifier}'<>v_identifier then
    raise exception 'public item.unique_identifier must match provisioned battery identifier' using errcode='DP603';
  end if;
  if p_public_payload#>>'{model,identification,category}' is not null
     and p_public_payload#>>'{model,identification,category}'<>'light_means_of_transport' then
    raise exception 'public model category must be light_means_of_transport' using errcode='DP603';
  end if;

  perform public.dpp_assert_public_passport_payload_safe(p_public_payload,v_identifier);

  select i.* into v_item
  from public.dpp_battery_items i
  where i.unique_identifier=v_identifier
  for update;

  if found then
    if v_item.organization_id<>v_org or v_item.model_id<>p_model_id
       or v_item.lifecycle_status<>'original' or v_item.canonical_data<>p_item_canonical_data then
      raise exception 'battery identifier already belongs to a different item state' using errcode='DP604';
    end if;
  else
    insert into public.dpp_battery_items(
      organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by
    ) values (v_org,p_model_id,v_identifier,'original',p_item_canonical_data,v_user)
    on conflict (unique_identifier) do nothing
    returning * into v_item;
    if found then
      v_created_item:=true;
    else
      select i.* into v_item from public.dpp_battery_items i where i.unique_identifier=v_identifier for update;
      if not found or v_item.organization_id<>v_org or v_item.model_id<>p_model_id
         or v_item.lifecycle_status<>'original' or v_item.canonical_data<>p_item_canonical_data then
        raise exception 'battery identifier already belongs to a different item state' using errcode='DP604';
      end if;
    end if;
  end if;

  select p.* into v_passport
  from public.dpp_passports p
  where p.organization_id=v_org and p.battery_item_id=v_item.id
  for update;

  if found then
    if v_passport.status<>'draft'
       or v_passport.public_payload<>p_public_payload
       or v_passport.private_payload<>p_private_payload then
      raise exception 'battery passport already exists with different state or payload' using errcode='DP605';
    end if;
  else
    insert into public.dpp_passports(
      organization_id,battery_item_id,status,public_payload,private_payload,created_by
    ) values (v_org,v_item.id,'draft',p_public_payload,p_private_payload,v_user)
    on conflict (organization_id,battery_item_id) do nothing
    returning * into v_passport;
    if found then
      v_created_passport:=true;
    else
      select p.* into v_passport
      from public.dpp_passports p
      where p.organization_id=v_org and p.battery_item_id=v_item.id
      for update;
      if not found or v_passport.status<>'draft'
         or v_passport.public_payload<>p_public_payload
         or v_passport.private_payload<>p_private_payload then
        raise exception 'battery passport already exists with different state or payload' using errcode='DP605';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'item_id',v_item.id,
    'passport_id',v_passport.id,
    'model_id',v_item.model_id,
    'unique_identifier',v_item.unique_identifier,
    'lifecycle_status',v_item.lifecycle_status,
    'passport_status',v_passport.status,
    'public_payload',v_passport.public_payload,
    'activation_required',true,
    'created_item',v_created_item,
    'created_passport',v_created_passport,
    'idempotent_replay',not (v_created_item or v_created_passport),
    'created_at',v_item.created_at,
    'updated_at',v_passport.updated_at
  );
end
$fn$;

revoke all on function public.dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb)
from public,anon;
grant execute on function public.dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb)
to authenticated;

comment on table public.dpp_authority_evidence is
  'Authority-only LMT readiness evidence. Direct anon/authenticated table access is denied; payload access is not exposed by Step 18.';
comment on function public.dpp_api_scooter_passport_readiness(uuid) is
  'Step 18 tenant-scoped LMT 2027 launch readiness report. Returns only missing/undecided point numbers, never authority evidence payload.';
comment on function public.dpp_api_scooter_passport_activate(uuid,timestamptz) is
  'Step 18 fail-closed activation route: only complete LMT passports can transition to ACTIVE.';
comment on function public.dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb) is
  'Stage 4/Step 18 atomic LMT provisioning: creates/reuses individual item and DRAFT passport; public activation is separate and readiness-gated.';
