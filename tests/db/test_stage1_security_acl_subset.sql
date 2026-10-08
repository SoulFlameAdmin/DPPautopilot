-- Stage 1 security regression in disposable PostgreSQL 17 CI only.
-- Run after all repo migrations on an isolated database.
-- Safe for CI: this SQL only inspects ACL/function contracts and calls no mutating RPC.

do $security$
declare
  v_capacity oid := to_regprocedure('public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamp with time zone)');
  v_ensure oid := to_regprocedure('public.dpp_api_organization_ensure(text,text)');
  v_configure oid := to_regprocedure('public.dpp_api_manufacturer_onboarding_configure()');
  v_source text;
  v_expected text;
begin
  if v_capacity is null or v_ensure is null or v_configure is null then
    raise exception 'STAGE1: required DPP functions are missing';
  end if;
  if has_function_privilege('anon',v_capacity,'EXECUTE') then
    raise exception 'STAGE1: anonymous capacity-update RPC is executable';
  end if;
  if not has_function_privilege('authenticated',v_capacity,'EXECUTE') then
    raise exception 'STAGE1: signed-in capacity-update RPC is unexpectedly denied';
  end if;
  if has_function_privilege('anon',v_ensure,'EXECUTE') then
    raise exception 'STAGE1: anonymous organization ensure is executable';
  end if;
  if not has_function_privilege('authenticated',v_ensure,'EXECUTE') then
    raise exception 'STAGE1: signed-in organization ensure is unexpectedly denied';
  end if;
  if has_function_privilege('anon',v_configure,'EXECUTE') then
    raise exception 'STAGE1: anonymous manufacturer configure is executable';
  end if;
  if not has_function_privilege('authenticated',v_configure,'EXECUTE') then
    raise exception 'STAGE1: signed-in manufacturer configure is unexpectedly denied';
  end if;

  v_source:=pg_get_functiondef(v_configure);
  if position('public.dpp_require_active_role' in v_source)=0 then
    raise exception 'STAGE1: manufacturer configuration lost tenant RBAC authorization';
  end if;
  if position('SECURITY DEFINER' in v_source)=0 then
    raise exception 'STAGE1: unexpected configure function execution context';
  end if;

  foreach v_expected in array array['workflow','product','batch','dpp','qr','ready']
  loop
    if position(format('jsonb_build_object(''key'',''%s'',''status'',''pending'')',v_expected) in v_source)=0 then
      raise exception 'STAGE1: onboarding is falsely marking % done',v_expected;
    end if;
  end loop;
  raise notice 'STAGE1 SECURITY PASS: DB ACL + tenant RBAC + truthful onboarding contracts';
end
$security$;
