-- PROPOSAL ONLY while Stage 1 C04 is RED.
-- A2.1 hardening: remove the legacy one-candidate-per-field UNIQUE constraint by structure,
-- not by PostgreSQL's truncated auto-generated constraint name. The 4-column approval identity
-- UNIQUE (organization_id, session_id, field_key, id) remains intact.

do $block$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.dpp_ai_intake_candidates'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by u.ordinality)
        from unnest(c.conkey) with ordinality as u(attnum, ordinality)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = u.attnum
      ) = array['organization_id','session_id','field_key']::name[]
  loop
    execute format(
      'alter table public.dpp_ai_intake_candidates drop constraint %I',
      v_constraint.conname
    );
  end loop;

  if exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.dpp_ai_intake_candidates'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by u.ordinality)
        from unnest(c.conkey) with ordinality as u(attnum, ordinality)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = u.attnum
      ) = array['organization_id','session_id','field_key']::name[]
  ) then
    raise exception 'Legacy AI one-candidate-per-field unique constraint still exists';
  end if;
end
$block$;

comment on table public.dpp_ai_intake_candidates is
  'Worker-A-compatible evidence candidates. Multiple candidates per field are retained so conflicts can be reviewed explicitly.';
