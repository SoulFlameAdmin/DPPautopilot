-- Global DPP database security-surface guard.
-- Every public.dpp_* table must have RLS enabled and no direct anon/authenticated table grants.

do $guard$
declare
  v_missing_rls text;
  v_grants text;
begin
  select string_agg(c.relname,', ' order by c.relname)
    into v_missing_rls
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind in ('r','p')
    and c.relname like 'dpp\_%' escape '\'
    and not c.relrowsecurity;

  if v_missing_rls is not null then
    raise exception 'DPP tables missing RLS: %',v_missing_rls;
  end if;

  select string_agg(grantee||':'||table_name||':'||privilege_type,', ' order by grantee,table_name,privilege_type)
    into v_grants
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name like 'dpp\_%' escape '\'
    and grantee in ('anon','authenticated');

  if v_grants is not null then
    raise exception 'DPP direct client table grants detected: %',v_grants;
  end if;
end
$guard$;

select 'DPP_GLOBAL_RLS_GRANTS_GUARD_PASS' as result;
