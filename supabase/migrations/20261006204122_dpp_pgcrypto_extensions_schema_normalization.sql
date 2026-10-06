-- Normalize pgcrypto into the trusted extensions schema across Supabase and clean PostgreSQL replay.
create schema if not exists extensions;

do $migration$
declare
  v_schema text;
begin
  select n.nspname
    into v_schema
  from pg_extension e
  join pg_namespace n on n.oid=e.extnamespace
  where e.extname='pgcrypto';

  if v_schema is null then
    execute 'create extension pgcrypto with schema extensions';
  elsif v_schema <> 'extensions' then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end
$migration$;
