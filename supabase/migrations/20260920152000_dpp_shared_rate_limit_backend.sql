-- R05 shared authenticated rate-limit backend precursor.
-- Shared atomic counters for authenticated API budgets. Public anonymous passport
-- traffic remains process-local until a safe non-spoofable distributed identity path exists.

create table if not exists public.dpp_rate_limit_buckets (
  bucket_key text primary key,
  window_start timestamptz not null,
  reset_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default clock_timestamp(),
  constraint dpp_rate_limit_bucket_key_format check (
    bucket_key ~ '^(tenant|organizations|members|models|items|passport|imports|export)\|(authenticated_read|authenticated_write|export_read|import_write)\|(network:[0-9a-f]{32}|credential:[0-9a-f]{24})$'
  ),
  constraint dpp_rate_limit_window_order check (reset_at > window_start)
);

alter table public.dpp_rate_limit_buckets enable row level security;
revoke all on table public.dpp_rate_limit_buckets from public, anon, authenticated;

create index if not exists dpp_rate_limit_buckets_reset_at_idx
  on public.dpp_rate_limit_buckets(reset_at);

create or replace function public.dpp_rate_limit_consume(
  p_bucket_key text,
  p_window_seconds integer,
  p_limit integer,
  p_now timestamptz default clock_timestamp()
)
returns table(
  allowed boolean,
  request_count integer,
  remaining integer,
  reset_epoch_seconds bigint,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_reset timestamptz;
  v_count integer;
begin
  if public.dpp_request_user_id() is null then
    raise exception using errcode='DP601', message='authenticated rate-limit identity required';
  end if;

  if p_bucket_key is null
     or p_bucket_key !~ '^(tenant|organizations|members|models|items|passport|imports|export)\|(authenticated_read|authenticated_write|export_read|import_write)\|(network:[0-9a-f]{32}|credential:[0-9a-f]{24})$' then
    raise exception using errcode='DP602', message='invalid rate-limit bucket key';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception using errcode='DP603', message='invalid rate-limit window';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception using errcode='DP604', message='invalid rate-limit limit';
  end if;

  v_start := to_timestamp(
    floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );
  v_reset := v_start + make_interval(secs => p_window_seconds);

  insert into public.dpp_rate_limit_buckets(
    bucket_key, window_start, reset_at, request_count, updated_at
  )
  values (p_bucket_key, v_start, v_reset, 1, clock_timestamp())
  on conflict (bucket_key) do update
    set window_start = excluded.window_start,
        reset_at = excluded.reset_at,
        request_count = case
          when public.dpp_rate_limit_buckets.window_start = excluded.window_start
            then public.dpp_rate_limit_buckets.request_count + 1
          else 1
        end,
        updated_at = clock_timestamp()
  returning public.dpp_rate_limit_buckets.request_count into v_count;

  -- Opportunistic bounded-retention cleanup of stale windows. The indexed predicate
  -- keeps this deterministic while preventing durable pseudonymous bucket buildup.
  delete from public.dpp_rate_limit_buckets
   where reset_at < p_now - interval '10 minutes';

  return query
  select
    v_count <= p_limit,
    v_count,
    greatest(0, p_limit - v_count),
    ceil(extract(epoch from v_reset))::bigint,
    case when v_count <= p_limit then 0
         else greatest(1, ceil(extract(epoch from (v_reset - p_now)))::integer)
    end;
end
$$;

revoke all on function public.dpp_rate_limit_consume(text,integer,integer,timestamptz) from public, anon;
grant execute on function public.dpp_rate_limit_consume(text,integer,integer,timestamptz) to authenticated;
