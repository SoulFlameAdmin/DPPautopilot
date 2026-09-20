-- T08 partial reliability suite for already-GREEN M15/M16 registry workflow.
-- Intentionally excludes M23 idempotency/concurrency; T08 remains RED until M23 is GREEN.

do $t08$
declare
  v_org uuid := '12121212-1212-4121-8121-121212121212';
  v_model uuid := '23232323-2323-4232-8232-232323232323';
  v_item uuid := '34343434-3434-4343-8343-343434343434';
  v_passport uuid := '45454545-4545-4454-8454-454545454545';
  v_submission uuid := '56565656-5656-4565-8565-565656565656';
  v_attempts integer;
  v_error text;
  v_retry timestamptz;
  v_submitted timestamptz;
  v_accepted timestamptz;
  invalid_terminal_rejected boolean := false;
  request_secret_rejected boolean := false;
  response_secret_rejected boolean := false;
  v_guard_submission uuid := '67676767-6767-4767-8767-676767676767';
begin
  insert into public.dpp_organizations(id,name,slug)
  values(v_org,'T08 Reliability Org','t08-reliability');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values(
    v_model,v_org,'T08-MODEL','T08 Manufacturer','electric_vehicle','{}'::jsonb
  );

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data
  ) values(
    v_item,v_org,v_model,'urn:dpp:t08:000001','original','{}'::jsonb
  );

  insert into public.dpp_passports(
    id,organization_id,battery_item_id,status,public_payload,private_payload
  ) values(
    v_passport,v_org,v_item,'draft','{}'::jsonb,'{}'::jsonb
  );

  insert into public.dpp_registry_submissions(
    id,organization_id,battery_item_id,passport_id,environment,provider,status,request_payload
  ) values(
    v_submission,v_org,v_item,v_passport,'test','eu_dpp_registry','draft',
    '{"suite":"T08","synthetic":true,"product":{"serial":"SAFE-001"}}'::jsonb
  );

  -- R07 registry request payload credential guard: nested credential-like keys fail closed.
  begin
    insert into public.dpp_registry_submissions(
      id,organization_id,battery_item_id,passport_id,environment,provider,status,request_payload
    ) values(
      v_guard_submission,v_org,v_item,v_passport,'test','eu_dpp_registry','draft',
      '{"product":{"serial":"SAFE-002"},"transport":[{"access_token":"must-not-persist"}]}'::jsonb
    );
  exception when check_violation then
    request_secret_rejected:=true;
  end;
  if not request_secret_rejected then
    raise exception 'R07 registry request payload allowed credential-bearing key';
  end if;

  update public.dpp_registry_submissions set status='queued' where id=v_submission;
  update public.dpp_registry_submissions set status='submitted' where id=v_submission;

  update public.dpp_registry_submissions
  set status='retry_wait',
      last_error_code='TIMEOUT',
      last_error_message='synthetic timeout',
      next_retry_at=now()
  where id=v_submission;

  update public.dpp_registry_submissions set status='queued' where id=v_submission;
  update public.dpp_registry_submissions set status='submitted' where id=v_submission;

  select attempt_count,last_error_code,next_retry_at,submitted_at
    into v_attempts,v_error,v_retry,v_submitted
  from public.dpp_registry_submissions
  where id=v_submission;

  if v_attempts<>2 then
    raise exception 'T08 expected attempt_count=2 after retry, got %',v_attempts;
  end if;
  if v_error<>'TIMEOUT' or v_retry is null then
    raise exception 'T08 retry metadata was not preserved';
  end if;
  if v_submitted is null then
    raise exception 'T08 submitted_at missing after retry';
  end if;

  begin
    update public.dpp_registry_submissions
    set response_payload='{"accepted":true,"provider_meta":{"api_key":"must-not-persist"}}'::jsonb
    where id=v_submission;
  exception when check_violation then
    response_secret_rejected:=true;
  end;
  if not response_secret_rejected then
    raise exception 'R07 registry response payload allowed credential-bearing key';
  end if;

  update public.dpp_registry_submissions
  set status='accepted',
      external_reference='T08-ACCEPTED',
      response_payload='{"accepted":true,"provider_meta":{"code":"OK"}}'::jsonb
  where id=v_submission;

  select accepted_at into v_accepted
  from public.dpp_registry_submissions where id=v_submission;

  if v_accepted is null then
    raise exception 'T08 accepted_at missing after successful retry';
  end if;

  begin
    update public.dpp_registry_submissions set status='retry_wait' where id=v_submission;
  exception when check_violation then
    invalid_terminal_rejected := true;
  end;

  if not invalid_terminal_rejected then
    raise exception 'T08 terminal accepted state incorrectly allowed retry_wait';
  end if;

  -- R07 canonical registry credential guard consolidation.
  if exists(
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='dpp_registry_submissions'
      and not t.tgisinternal
      and t.tgname='dpp_registry_request_payload_privacy_guard'
  ) then
    raise exception 'R07 superseded request-only registry guard trigger still exists';
  end if;

  if to_regprocedure('public.dpp_reject_registry_payload_credentials()') is not null
     or to_regprocedure('public.dpp_json_has_credential_key(jsonb)') is not null then
    raise exception 'R07 superseded request-only registry guard helper still exists';
  end if;

  if not exists(
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    where n.nspname='public'
      and c.relname='dpp_registry_submissions'
      and not t.tgisinternal
      and t.tgname='dpp_registry_payload_credential_guard'
      and p.proname='dpp_guard_registry_payload_credentials'
  ) then
    raise exception 'R07 canonical request+response registry guard is missing';
  end if;
end
$t08$;

select 'T08_REGISTRY_RELIABILITY_SUBSET_PASS' as result;
