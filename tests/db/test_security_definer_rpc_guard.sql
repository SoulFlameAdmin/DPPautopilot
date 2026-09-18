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
      'dpp_active_organization_id()',
      'dpp_api_models_create(text,text,text,jsonb)',
      'dpp_api_models_delete(uuid)',
      'dpp_api_models_list()',
      'dpp_api_models_update(uuid,text,text,text,jsonb)',
      'dpp_api_passport_create(uuid,jsonb,jsonb)',
      'dpp_api_passport_private(uuid)',
      'dpp_api_passport_public(text)',
      'dpp_api_passport_update(uuid,text,jsonb,jsonb)',
      'dpp_api_items_create(uuid,text,text,jsonb)',
      'dpp_api_items_delete(uuid)',
      'dpp_api_items_list()',
      'dpp_api_items_update(uuid,uuid,text,text,jsonb)',
      'dpp_api_export_bundle()',
      'dpp_has_org_role(uuid,text[])',
      'dpp_request_user_id()',
      'dpp_require_active_role(text[])',
      'dpp_set_active_organization(uuid)'
    );

  if v_auth_extra is not null then
    raise exception 'Unexpected authenticated DPP RPC exposure: %',v_auth_extra;
  end if;

  with required(signature) as (
    values
      ('dpp_active_organization_id()'),
      ('dpp_api_models_create(text,text,text,jsonb)'),
      ('dpp_api_models_delete(uuid)'),
      ('dpp_api_models_list()'),
      ('dpp_api_models_update(uuid,text,text,text,jsonb)'),
      ('dpp_api_passport_create(uuid,jsonb,jsonb)'),
      ('dpp_api_passport_private(uuid)'),
      ('dpp_api_passport_public(text)'),
      ('dpp_api_passport_update(uuid,text,jsonb,jsonb)'),
      ('dpp_api_items_create(uuid,text,text,jsonb)'),
      ('dpp_api_items_delete(uuid)'),
      ('dpp_api_items_list()'),
      ('dpp_api_items_update(uuid,uuid,text,text,jsonb)'),
      ('dpp_api_export_bundle()'),
      ('dpp_has_org_role(uuid,text[])'),
      ('dpp_request_user_id()'),
      ('dpp_require_active_role(text[])'),
      ('dpp_set_active_organization(uuid)')
  )
  select string_agg(r.signature,', ' order by r.signature)
    into v_auth_missing
  from required r
  where not has_function_privilege('authenticated',to_regprocedure('public.'||r.signature),'EXECUTE');

  if v_auth_missing is not null then
    raise exception 'Required authenticated DPP RPC missing EXECUTE: %',v_auth_missing;
  end if;
end
$guard$;

select 'DPP_SECURITY_DEFINER_RPC_GUARD_PASS' as result;
