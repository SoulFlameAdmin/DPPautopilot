-- R05 shared authenticated rate-limit backend regression.
-- CI executes inside a transaction after clean migration replay.

select set_config('request.jwt.claim.sub','f1111111-1111-4111-8111-111111111111',true);

do $r05$
declare
  r record;
  seen boolean;
begin
  select * into r
  from public.dpp_rate_limit_consume(
    'models|authenticated_write|network:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    60,2,'2026-09-20T15:00:01Z'::timestamptz
  );
  if not r.allowed or r.request_count<>1 or r.remaining<>1 then
    raise exception 'R05 first shared consume mismatch: %',row_to_json(r);
  end if;

  select * into r
  from public.dpp_rate_limit_consume(
    'models|authenticated_write|network:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    60,2,'2026-09-20T15:00:02Z'::timestamptz
  );
  if not r.allowed or r.request_count<>2 or r.remaining<>0 then
    raise exception 'R05 second shared consume mismatch: %',row_to_json(r);
  end if;

  select * into r
  from public.dpp_rate_limit_consume(
    'models|authenticated_write|network:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    60,2,'2026-09-20T15:00:03Z'::timestamptz
  );
  if r.allowed or r.request_count<>3 or r.remaining<>0 or r.retry_after_seconds<1 then
    raise exception 'R05 shared over-budget mismatch: %',row_to_json(r);
  end if;

  select * into r
  from public.dpp_rate_limit_consume(
    'models|authenticated_write|network:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    60,2,'2026-09-20T15:01:01Z'::timestamptz
  );
  if not r.allowed or r.request_count<>1 or r.remaining<>1 then
    raise exception 'R05 shared window reset mismatch: %',row_to_json(r);
  end if;

  select * into r
  from public.dpp_rate_limit_consume(
    'models|authenticated_write|credential:bbbbbbbbbbbbbbbbbbbbbbbb',
    60,2,'2026-09-20T15:01:01Z'::timestamptz
  );
  if not r.allowed or r.request_count<>1 then
    raise exception 'R05 shared credential bucket mismatch: %',row_to_json(r);
  end if;

  seen:=false;
  begin
    perform public.dpp_rate_limit_consume(
      'models|authenticated_write|network:not-a-hash',
      60,2,'2026-09-20T15:01:02Z'::timestamptz
    );
  exception when sqlstate 'DP602' then
    seen:=true;
  end;
  if not seen then raise exception 'R05 invalid shared bucket key was accepted'; end if;

  seen:=false;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.dpp_rate_limit_consume(
      'models|authenticated_write|network:cccccccccccccccccccccccccccccccc',
      60,2,'2026-09-20T15:01:03Z'::timestamptz
    );
  exception when sqlstate 'DP601' then
    seen:=true;
  end;
  if not seen then raise exception 'R05 unauthenticated shared consume was accepted'; end if;

  if has_table_privilege('anon','public.dpp_rate_limit_buckets','SELECT')
     or has_table_privilege('authenticated','public.dpp_rate_limit_buckets','SELECT')
     or has_table_privilege('authenticated','public.dpp_rate_limit_buckets','INSERT')
     or has_table_privilege('authenticated','public.dpp_rate_limit_buckets','UPDATE')
     or has_table_privilege('authenticated','public.dpp_rate_limit_buckets','DELETE') then
    raise exception 'R05 shared bucket table regained direct client privileges';
  end if;

  if has_function_privilege(
      'anon',
      'public.dpp_rate_limit_consume(text,integer,integer,timestamp with time zone)',
      'EXECUTE'
    ) then
    raise exception 'R05 shared authenticated limiter exposed to anon';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.dpp_rate_limit_consume(text,integer,integer,timestamp with time zone)',
      'EXECUTE'
    ) then
    raise exception 'R05 shared limiter missing authenticated EXECUTE';
  end if;
end
$r05$;

select 'R05_SHARED_RATE_LIMIT_BACKEND_PASS' as result;
