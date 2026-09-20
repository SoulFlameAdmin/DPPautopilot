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
    and p.oid::regprocedure::text <> 'dpp_api_passport_public(text)';

  if v_anon_extra is not null then
    raise exception 'Unexpected anon DPP RPC exposure: %',v_anon_extra;
  end if;

  if not has_function_privilege(
    'anon',
    to_regprocedure('public.dpp_api_passport_public(text)'),
    'EXECUTE'
  ) then
    v_anon_missing := 'dpp_api_passport_public(text)';
  end if;

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
      'dpp_api_retention_status()',
      'dpp_api_purge_import_staging(timestamp with time zone)',
      'dpp_api_items_create(uuid,text,text,jsonb)',
      'dpp_api_items_delete_checked(uuid,timestamp with time zone)',
      'dpp_api_items_list()',
      'dpp_api_items_update_checked(uuid,uuid,text,text,jsonb,timestamp with time zone)',
      'dpp_api_export_bundle()',
      'dpp_api_import_commit(uuid)',
      'dpp_api_import_create(jsonb,uuid)',
      'dpp_api_import_get(uuid)',
      'dpp_api_import_validate(uuid)',
      'dpp_api_tenant_context()',
      'dpp_api_tenant_context_set(uuid)',
      'dpp_evidence_storage_org_id(text)',
      'dpp_evidence_storage_registered(text)',
      'dpp_has_org_role(uuid,text[])',
      'dpp_request_user_id()'
    );

  if v_auth_extra is not null then
    raise exception 'Unexpected authenticated DPP RPC exposure: %',v_auth_extra;
  end if;

  with required(signature) as (
    values
      ('dpp_api_authorization_context()'),
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
      ('dpp_api_retention_status()'),
      ('dpp_api_purge_import_staging(timestamp with time zone)'),
      ('dpp_api_items_create(uuid,text,text,jsonb)'),
      ('dpp_api_items_delete_checked(uuid,timestamp with time zone)'),
      ('dpp_api_items_list()'),
      ('dpp_api_items_update_checked(uuid,uuid,text,text,jsonb,timestamp with time zone)'),
      ('dpp_api_export_bundle()'),
      ('dpp_api_import_commit(uuid)'),
      ('dpp_api_import_create(jsonb,uuid)'),
      ('dpp_api_import_get(uuid)'),
      ('dpp_api_import_validate(uuid)'),
      ('dpp_api_tenant_context()'),
      ('dpp_api_tenant_context_set(uuid)'),
      ('dpp_evidence_storage_org_id(text)'),
      ('dpp_evidence_storage_registered(text)'),
      ('dpp_has_org_role(uuid,text[])'),
      ('dpp_request_user_id()')
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
