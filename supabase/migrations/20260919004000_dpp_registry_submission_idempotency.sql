-- M23 partial: idempotent registry submission creation for GREEN M15/M16.
-- A caller-supplied idempotency key is scoped by organization/provider/environment.
-- Reuse with different semantic request data fails closed.

alter table public.dpp_registry_submissions
  add column idempotency_key text null
  check (
    idempotency_key is null
    or length(btrim(idempotency_key)) between 1 and 120
  );

create unique index dpp_registry_submissions_idempotency_uidx
  on public.dpp_registry_submissions(
    organization_id,
    provider,
    environment,
    idempotency_key
  )
  where idempotency_key is not null;

create or replace function public.dpp_create_registry_submission(
  p_organization_id uuid,
  p_battery_item_id uuid,
  p_passport_id uuid,
  p_environment text,
  p_provider text,
  p_idempotency_key text,
  p_request_payload jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_id uuid;
  v_existing public.dpp_registry_submissions%rowtype;
  v_key text;
begin
  v_key := btrim(coalesce(p_idempotency_key,''));
  if length(v_key) < 1 or length(v_key) > 120 then
    raise exception 'registry idempotency key must contain 1-120 characters'
      using errcode='23514';
  end if;

  if p_environment not in ('test','live') then
    raise exception 'invalid registry environment: %',p_environment
      using errcode='23514';
  end if;

  if p_provider is null or length(btrim(p_provider)) < 1 or length(btrim(p_provider)) > 80 then
    raise exception 'invalid registry provider'
      using errcode='23514';
  end if;

  if p_request_payload is null or jsonb_typeof(p_request_payload) <> 'object' then
    raise exception 'registry request payload must be a JSON object'
      using errcode='23514';
  end if;

  insert into public.dpp_registry_submissions(
    organization_id,
    battery_item_id,
    passport_id,
    environment,
    provider,
    status,
    request_payload,
    idempotency_key,
    created_by
  ) values (
    p_organization_id,
    p_battery_item_id,
    p_passport_id,
    p_environment,
    btrim(p_provider),
    'draft',
    p_request_payload,
    v_key,
    p_created_by
  )
  on conflict (
    organization_id,
    provider,
    environment,
    idempotency_key
  ) where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object(
      'submission_id',v_id,
      'status','draft',
      'already_exists',false
    );
  end if;

  select * into v_existing
  from public.dpp_registry_submissions
  where organization_id=p_organization_id
    and provider=btrim(p_provider)
    and environment=p_environment
    and idempotency_key=v_key;

  if not found then
    raise exception 'registry idempotency conflict could not be resolved'
      using errcode='40001';
  end if;

  if v_existing.battery_item_id is distinct from p_battery_item_id
     or v_existing.passport_id is distinct from p_passport_id
     or v_existing.request_payload is distinct from p_request_payload then
    raise exception 'registry idempotency key reused with different request data'
      using errcode='23514';
  end if;

  return jsonb_build_object(
    'submission_id',v_existing.id,
    'status',v_existing.status,
    'already_exists',true
  );
end
$fn$;

revoke all on function public.dpp_create_registry_submission(
  uuid,uuid,uuid,text,text,text,jsonb,uuid
) from public,anon,authenticated;
