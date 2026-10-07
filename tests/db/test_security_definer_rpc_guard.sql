-- DPP SECURITY DEFINER / RPC privilege guard.
-- Prevents unsafe search_path and accidental RPC exposure regressions.

do $guard$
declare
  v_bad_path text;
  v_public_exec text;
  v_anon_extra text;
  v_anon_missing text;
  v_auth_extra text;
  v_auth_missing text;
begin
  select string_agg(p.oid::regprocedure::text,', ' order by p.oid::regprocedure::text)
    into v_bad_path
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname like 'dpp\_%' escape '\'
    and p.prosecdef
    and not (
      coalesce(p.proconfig,'{}'::text[]) @> array['search_path=public, pg_temp']::text[]
    );

  if v_bad_path is not null then
    raise exception 'DPP SECURITY DEFINER functions with unsafe/missing search_path: %',v_bad_path;
  end if;

  select string_agg(distinct p.oid::regprocedure::text,', ' order by p.oid::regprocedure::text)
    into v_public_exec
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname='public'
    and p.proname like 'dpp\_%' escape '\'
    and a.grantee=0
    and a.privilege_type='EXECUTE';

  if v_public_exec is not null then
    raise exception 'DPP functions executable by PUBLIC: %',v_public_exec;
  end if;

  select string_agg(p.oid::regprocedure::text,', ' order by p.oid::regprocedure::text)
    into v_anon_extra
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname like 'dpp\_%' escape '\'
    and has_function_privilege('anon',p.oid,'EXECUTE')
    and p.oid::regprocedure::text not in (
      'dpp_api_passport_public(text)',
      'dpp_api_passport_public_resolve(text)',
      'dpp_api_carrier_open(text,text)',
      'dpp_api_registration_request_create(text)'
    );

  if v_anon_extra is not null then
    raise exception 'Unexpected anon DPP RPC exposure: %',v_anon_extra;
  end if;

  with required(signature) as (
    values
      ('dpp_api_passport_public(text)'),
      ('dpp_api_passport_public_resolve(text)'),
      ('dpp_api_carrier_open(text,text)')
  )
  select string_agg(r.signature,', ' order by r.signature)
    into v_anon_missing
  from required r
  where not coalesce(
    has_function_privilege('anon',to_regprocedure('public.'||r.signature),'EXECUTE'),
    false
  );

  if v_anon_missing is not null then
    raise exception 'Required anon DPP RPC missing EXECUTE: %',v_anon_missing;
  end if;

  select string_agg(p.oid::regprocedure::text,', ' order by p.oid::regprocedure::text)
    into v_auth_extra
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname like 'dpp\_%' escape '\'
    and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and p.oid::regprocedure::text not in (
      'dpp_api_authorization_context()',
      'dpp_api_member_add_by_email(text,text)',
      'dpp_api_members_list_detail()',
      'dpp_api_members_add(uuid,text)',
      'dpp_api_members_delete(uuid)',
      'dpp_api_members_list()',
      'dpp_api_members_update(uuid,text)',
      'dpp_api_organization_create(text,text)',
      'dpp_api_organizations_list()',
      'dpp_api_models_create(text,text,text,jsonb)',
      'dpp_api_models_delete_checked(uuid,timestamp with time zone)',
      'dpp_api_models_list()',
      'dpp_api_models_update_checked(uuid,text,text,text,jsonb,timestamp with time zone)',
      'dpp_api_passport_create(uuid,jsonb,jsonb)',
      'dpp_api_passport_private(uuid)',
      'dpp_api_passport_public(text)',
      'dpp_api_passport_update_checked(uuid,text,jsonb,jsonb,timestamp with time zone)',
      'dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb)',
      'dpp_api_scooter_battery_batch_provision(uuid,text,jsonb)',
      'dpp_api_scooter_passport_readiness(uuid)',
      'dpp_api_scooter_passport_activate(uuid,timestamp with time zone)',
      'dpp_api_scooter_completeness_by_identifier(text)',
      'dpp_api_scooter_authority_evidence_submit(uuid,integer,jsonb)',
      'dpp_api_retention_status()',
      'dpp_api_org_deletion_impact()',
      'dpp_api_purge_import_staging(timestamp with time zone)',
      'dpp_api_items_create(uuid,text,text,jsonb)',
      'dpp_api_items_delete_checked(uuid,timestamp with time zone)',
      'dpp_api_items_list()',
      'dpp_api_items_update_checked(uuid,uuid,text,text,jsonb,timestamp with time zone)',
      'dpp_api_export_bundle()',
      'dpp_api_evidence_object_metadata(text)',
      'dpp_api_import_commit(uuid)',
      'dpp_api_import_create(jsonb,uuid)',
      'dpp_api_import_get(uuid)',
      'dpp_api_import_validate(uuid)',
      'dpp_api_tenant_context()',
      'dpp_api_tenant_context_set(uuid)',
      'dpp_evidence_storage_org_id(text)',
      'dpp_evidence_storage_registered(text)',
      'dpp_has_org_role(uuid,text[])',
      'dpp_request_user_id()',
      'dpp_api_authority_payload_set(uuid,jsonb)',
      'dpp_api_carrier_bind_secure(uuid,text,text,text)',
      'dpp_api_carrier_open(text,text)',
      'dpp_api_carrier_revoke(uuid,text)',
      'dpp_api_carrier_scan_history(uuid,integer)',
      'dpp_api_carriers_list(uuid)',
      'dpp_api_field_events_append(text,uuid,jsonb)',
      'dpp_api_import_errors(uuid)',
      'dpp_api_import_mapping_delete(uuid)',
      'dpp_api_import_mapping_list()',
      'dpp_api_import_mapping_save(uuid,text,text,jsonb,jsonb)',
      'dpp_api_item_history(uuid)',
      'dpp_api_nfc_challenge_create(text,text,text,timestamp with time zone)',
      'dpp_api_nfc_status(text)',
      'dpp_api_passport_authority(text)',
      'dpp_api_passport_legitimate_interest(text)',
      'dpp_api_passport_public_resolve(text)',
      'dpp_api_passports_list(integer)',
      'dpp_api_scooter_passport_transition(uuid,text,text,text,text,timestamp with time zone)',
      'dpp_api_supplier_create(text,text)',
      'dpp_api_supplier_invitation_accept(text)',
      'dpp_api_supplier_invitation_create(uuid,text,text,text,timestamp with time zone)',
      'dpp_api_supplier_invitations_list(uuid)',
      'dpp_api_supplier_package_create(uuid,text,text,uuid,uuid,text,text,jsonb,timestamp with time zone,uuid)',
      'dpp_api_supplier_package_verify(uuid,text,text,text)',
      'dpp_api_supplier_reminder_create(uuid,text,text,text)',
      'dpp_api_supplier_reminders_list(uuid)',
      'dpp_api_suppliers_list()',
      'dpp_api_technical_pilot_publish(uuid,jsonb,jsonb)',
      'dpp_rate_limit_consume(text,integer,integer,timestamp with time zone)',
      'dpp_api_registration_request_verify(uuid)',
      'dpp_api_registration_requests_mine()',
      'dpp_api_manufacturer_onboarding_answer_upsert(text,text,jsonb)',
      'dpp_api_manufacturer_onboarding_get()',
      'dpp_api_manufacturer_onboarding_configure()'
    );

  if v_auth_extra is not null then
    raise exception 'Unexpected authenticated DPP RPC exposure: %',v_auth_extra;
  end if;

  with required(signature) as (
    values
      ('dpp_api_authorization_context()'),
      ('dpp_api_member_add_by_email(text,text)'),
      ('dpp_api_members_list_detail()'),
      ('dpp_api_members_add(uuid,text)'),
      ('dpp_api_members_delete(uuid)'),
      ('dpp_api_members_list()'),
      ('dpp_api_members_update(uuid,text)'),
      ('dpp_api_organization_create(text,text)'),
      ('dpp_api_organizations_list()'),
      ('dpp_api_models_create(text,text,text,jsonb)'),
      ('dpp_api_models_delete_checked(uuid,timestamp with time zone)'),
      ('dpp_api_models_list()'),
      ('dpp_api_models_update_checked(uuid,text,text,text,jsonb,timestamp with time zone)'),
      ('dpp_api_passport_create(uuid,jsonb,jsonb)'),
      ('dpp_api_passport_private(uuid)'),
      ('dpp_api_passport_public(text)'),
      ('dpp_api_passport_update_checked(uuid,text,jsonb,jsonb,timestamp with time zone)'),
      ('dpp_api_scooter_battery_provision(uuid,text,jsonb,jsonb,jsonb)'),
      ('dpp_api_scooter_battery_batch_provision(uuid,text,jsonb)'),
      ('dpp_api_scooter_passport_readiness(uuid)'),
      ('dpp_api_scooter_passport_activate(uuid,timestamp with time zone)'),
      ('dpp_api_scooter_completeness_by_identifier(text)'),
      ('dpp_api_scooter_authority_evidence_submit(uuid,integer,jsonb)'),
      ('dpp_api_retention_status()'),
      ('dpp_api_org_deletion_impact()'),
      ('dpp_api_purge_import_staging(timestamp with time zone)'),
      ('dpp_api_items_create(uuid,text,text,jsonb)'),
      ('dpp_api_items_delete_checked(uuid,timestamp with time zone)'),
      ('dpp_api_items_list()'),
      ('dpp_api_items_update_checked(uuid,uuid,text,text,jsonb,timestamp with time zone)'),
      ('dpp_api_export_bundle()'),
      ('dpp_api_evidence_object_metadata(text)'),
      ('dpp_api_import_commit(uuid)'),
      ('dpp_api_import_create(jsonb,uuid)'),
      ('dpp_api_import_get(uuid)'),
      ('dpp_api_import_validate(uuid)'),
      ('dpp_api_tenant_context()'),
      ('dpp_api_tenant_context_set(uuid)'),
      ('dpp_evidence_storage_org_id(text)'),
      ('dpp_evidence_storage_registered(text)'),
      ('dpp_has_org_role(uuid,text[])'),
      ('dpp_request_user_id()'),
      ('dpp_api_carrier_bind_secure(uuid,text,text,text)'),
      ('dpp_api_carrier_open(text,text)'),
      ('dpp_api_carrier_revoke(uuid,text)'),
      ('dpp_api_carrier_scan_history(uuid,integer)'),
      ('dpp_api_carriers_list(uuid)'),
      ('dpp_api_import_mapping_delete(uuid)'),
      ('dpp_api_import_mapping_list()'),
      ('dpp_api_import_mapping_save(uuid,text,text,jsonb,jsonb)'),
      ('dpp_api_passport_public_resolve(text)'),
      ('dpp_api_passports_list(integer)'),
      ('dpp_api_scooter_passport_transition(uuid,text,text,text,text,timestamp with time zone)'),
      ('dpp_api_technical_pilot_publish(uuid,jsonb,jsonb)'),
      ('dpp_rate_limit_consume(text,integer,integer,timestamp with time zone)'),
      ('dpp_api_registration_request_verify(uuid)'),
      ('dpp_api_registration_requests_mine()'),
      ('dpp_api_manufacturer_onboarding_answer_upsert(text,text,jsonb)'),
      ('dpp_api_manufacturer_onboarding_get()'),
      ('dpp_api_manufacturer_onboarding_configure()')
  )
  select string_agg(r.signature,', ' order by r.signature)
    into v_auth_missing
  from required r
  where not has_function_privilege('authenticated',to_regprocedure('public.'||r.signature),'EXECUTE');

  if v_auth_missing is not null then
    raise exception 'Required authenticated DPP RPC missing EXECUTE: %',v_auth_missing;
  end if;

  if has_function_privilege('authenticated',to_regprocedure('public.dpp_api_models_update(uuid,text,text,text,jsonb)'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.dpp_api_models_delete(uuid)'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.dpp_api_items_update(uuid,uuid,text,text,jsonb)'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.dpp_api_items_delete(uuid)'),'EXECUTE')
     or has_function_privilege('authenticated',to_regprocedure('public.dpp_api_passport_update(uuid,text,jsonb,jsonb)'),'EXECUTE') then
    raise exception 'M23 unchecked update/delete RPC regained authenticated EXECUTE';
  end if;
end
$guard$;

select 'DPP_SECURITY_DEFINER_RPC_GUARD_PASS' as result;
