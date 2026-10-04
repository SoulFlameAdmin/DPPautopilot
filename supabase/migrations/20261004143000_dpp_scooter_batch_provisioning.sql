-- Stage 5: atomic batch provisioning for Scooter Battery / LMT production runs.
-- One authenticated transaction provisions 1..250 individual batteries, ACTIVE passports
-- and durable batch membership. A failing unit rolls back the whole batch.

create table if not exists public.dpp_provision_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  model_id uuid not null references public.dpp_battery_models(id) on delete restrict,
  batch_key text not null,
  request_fingerprint text not null,
  quantity integer not null check (quantity between 1 and 250),
  status text not null default 'committed' check (status in ('committed')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,batch_key)
);

create table if not exists public.dpp_provision_batch_items (
  batch_id uuid not null references public.dpp_provision_batches(id) on delete cascade,
  position integer not null check (position >= 1),
  item_id uuid not null references public.dpp_battery_items(id) on delete restrict,
  passport_id uuid not null references public.dpp_passports(id) on delete restrict,
  unique_identifier text not null,
  primary key (batch_id,position),
  unique (batch_id,item_id),
  unique (batch_id,passport_id),
  unique (batch_id,unique_identifier)
);

create index if not exists dpp_provision_batches_org_created_idx
  on public.dpp_provision_batches(organization_id,created_at desc);
create index if not exists dpp_provision_batch_items_item_idx
  on public.dpp_provision_batch_items(item_id);

alter table public.dpp_provision_batches enable row level security;
alter table public.dpp_provision_batch_items enable row level security;
revoke all on public.dpp_provision_batches from public,anon,authenticated;
revoke all on public.dpp_provision_batch_items from public,anon,authenticated;

create or replace function public.dpp_api_scooter_battery_batch_provision(
  p_model_id uuid,
  p_batch_key text,
  p_units jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_model public.dpp_battery_models%rowtype;
  v_batch public.dpp_provision_batches%rowtype;
  v_unit jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_quantity integer;
  v_position integer := 0;
  v_identifier text;
  v_fingerprint text;
  v_created_batch boolean := false;
  v_existing_link public.dpp_provision_batch_items%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_model_id is null then
    raise exception 'model_id is required' using errcode='DP603';
  end if;

  if p_batch_key is null
     or length(btrim(p_batch_key)) not between 1 and 128
     or btrim(p_batch_key) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'batch_key is invalid' using errcode='DP603';
  end if;

  if p_units is null or jsonb_typeof(p_units)<>'array' then
    raise exception 'units must be a JSON array' using errcode='DP603';
  end if;

  v_quantity:=jsonb_array_length(p_units);
  if v_quantity not between 1 and 250 then
    raise exception 'batch quantity must be between 1 and 250' using errcode='DP603';
  end if;

  select m.* into v_model
  from public.dpp_battery_models m
  where m.id=p_model_id and m.organization_id=v_org
  for share;

  if not found then
    raise exception 'battery model not found in active organization' using errcode='DP601';
  end if;
  if v_model.category<>'light_means_of_transport' then
    raise exception 'battery model is not an LMT model' using errcode='DP602';
  end if;

  v_fingerprint:=encode(digest(convert_to(p_units::text,'UTF8'),'sha256'),'hex');

  select b.* into v_batch
  from public.dpp_provision_batches b
  where b.organization_id=v_org and b.batch_key=btrim(p_batch_key)
  for update;

  if found then
    if v_batch.model_id<>p_model_id
       or v_batch.request_fingerprint<>v_fingerprint
       or v_batch.quantity<>v_quantity
       or v_batch.status<>'committed' then
      raise exception 'batch key already belongs to a different provisioning request'
        using errcode='DP606';
    end if;
  else
    insert into public.dpp_provision_batches(
      organization_id,model_id,batch_key,request_fingerprint,quantity,status,created_by
    ) values (
      v_org,p_model_id,btrim(p_batch_key),v_fingerprint,v_quantity,'committed',v_user
    )
    returning * into v_batch;
    v_created_batch:=true;
  end if;

  for v_unit in select value from jsonb_array_elements(p_units)
  loop
    v_position:=v_position+1;
    if jsonb_typeof(v_unit)<>'object' then
      raise exception 'every batch unit must be an object' using errcode='DP603';
    end if;

    v_identifier:=btrim(coalesce(v_unit->>'unique_identifier',''));
    if length(v_identifier) not between 1 and 300
       or v_identifier ~ '[[:cntrl:]]' then
      raise exception 'batch unit identifier is invalid' using errcode='DP603';
    end if;

    select public.dpp_api_scooter_battery_provision(
      p_model_id,
      v_identifier,
      coalesce(v_unit->'item_canonical_data','{}'::jsonb),
      coalesce(v_unit->'public_payload','{}'::jsonb),
      coalesce(v_unit->'private_payload','{}'::jsonb)
    ) into v_result;

    if v_created_batch then
      insert into public.dpp_provision_batch_items(
        batch_id,position,item_id,passport_id,unique_identifier
      ) values (
        v_batch.id,
        v_position,
        (v_result->>'item_id')::uuid,
        (v_result->>'passport_id')::uuid,
        v_result->>'unique_identifier'
      );
    else
      select x.* into v_existing_link
      from public.dpp_provision_batch_items x
      where x.batch_id=v_batch.id and x.position=v_position;

      if not found
         or v_existing_link.item_id<>(v_result->>'item_id')::uuid
         or v_existing_link.passport_id<>(v_result->>'passport_id')::uuid
         or v_existing_link.unique_identifier<>v_result->>'unique_identifier' then
        raise exception 'stored batch membership conflicts with provisioned item'
          using errcode='DP607';
      end if;
    end if;

    v_results:=v_results || jsonb_build_array(
      v_result || jsonb_build_object('position',v_position)
    );
  end loop;

  if not v_created_batch and (
    select count(*) from public.dpp_provision_batch_items x where x.batch_id=v_batch.id
  )<>v_quantity then
    raise exception 'stored batch membership count is inconsistent'
      using errcode='DP607';
  end if;

  return jsonb_build_object(
    'batch_id',v_batch.id,
    'batch_key',v_batch.batch_key,
    'model_id',v_batch.model_id,
    'quantity',v_quantity,
    'created_batch',v_created_batch,
    'idempotent_replay',not v_created_batch,
    'created_at',v_batch.created_at,
    'units',v_results
  );
end
$fn$;

revoke all on function public.dpp_api_scooter_battery_batch_provision(uuid,text,jsonb)
from public,anon;
grant execute on function public.dpp_api_scooter_battery_batch_provision(uuid,text,jsonb)
to authenticated;

comment on table public.dpp_provision_batches is
  'Stage 5 durable idempotency boundary for one tenant-scoped LMT production batch. Direct client table access is denied by design.';
comment on table public.dpp_provision_batch_items is
  'Stage 5 immutable membership of physical battery items/passports in a provisioned production batch. Direct client table access is denied by design.';
comment on function public.dpp_api_scooter_battery_batch_provision(uuid,text,jsonb) is
  'Stage 5 atomic Produce-X workflow: one transaction provisions 1..250 LMT items/passports; identical batch retries are idempotent and divergent retries fail closed.';
