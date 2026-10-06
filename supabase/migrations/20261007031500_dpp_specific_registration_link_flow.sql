create table if not exists public.dpp_registration_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'requested',
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid references public.dpp_client_applications(id) on delete set null,
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint dpp_registration_requests_email_ck check (
    char_length(email) between 3 and 320 and position('@' in email) > 1
  ),
  constraint dpp_registration_requests_status_ck check (
    status in ('requested','verified','application_submitted')
  )
);

create index if not exists dpp_registration_requests_email_idx
  on public.dpp_registration_requests(lower(email), requested_at desc);
create index if not exists dpp_registration_requests_user_idx
  on public.dpp_registration_requests(user_id, requested_at desc);
create index if not exists dpp_registration_requests_status_idx
  on public.dpp_registration_requests(status, requested_at desc);

alter table public.dpp_registration_requests enable row level security;
revoke all on table public.dpp_registration_requests from anon, authenticated;

create or replace function public.dpp_api_registration_request_create(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_email text;
  v_id uuid;
  v_requested_at timestamptz;
begin
  v_email := lower(btrim(coalesce(p_email,'')));

  if length(v_email) < 3 or length(v_email) > 320 or
     v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'email is invalid' using errcode='DP501';
  end if;

  insert into public.dpp_registration_requests(email,status)
  values(v_email,'requested')
  returning id,requested_at into v_id,v_requested_at;

  return jsonb_build_object(
    'request_id',v_id,
    'email',v_email,
    'status','requested',
    'requested_at',v_requested_at
  );
end
$function$;

create or replace function public.dpp_api_registration_request_verify(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid;
  v_email text;
  v_row public.dpp_registration_requests%rowtype;
begin
  v_user := public.dpp_request_user_id();
  if v_user is null then
    raise exception 'authenticated user context is required' using errcode='DP101';
  end if;

  select lower(email) into v_email from auth.users where id=v_user;
  if v_email is null then
    raise exception 'verified email is required' using errcode='DP101';
  end if;

  select * into v_row
  from public.dpp_registration_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'registration request not found' using errcode='DP404';
  end if;

  if lower(v_row.email) <> v_email then
    raise exception 'registration request does not belong to authenticated user' using errcode='DP403';
  end if;

  update public.dpp_registration_requests
  set status=case when status='application_submitted' then status else 'verified' end,
      user_id=v_user,
      verified_at=coalesce(verified_at,now()),
      updated_at=now()
  where id=p_request_id
  returning * into v_row;

  return jsonb_build_object(
    'request_id',v_row.id,
    'email',v_row.email,
    'status',v_row.status,
    'verified_at',v_row.verified_at
  );
end
$function$;

create or replace function public.dpp_api_registration_requests_mine()
returns jsonb
language sql
security definer
set search_path to 'public','pg_temp'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'request_id',r.id,
        'email',r.email,
        'status',r.status,
        'requested_at',r.requested_at,
        'verified_at',r.verified_at,
        'completed_at',r.completed_at,
        'application_id',r.application_id
      )
      order by r.requested_at desc
    ),
    '[]'::jsonb
  )
  from public.dpp_registration_requests r
  where r.user_id=public.dpp_request_user_id()
$function$;

revoke all on function public.dpp_api_registration_request_create(text) from public, authenticated;
grant execute on function public.dpp_api_registration_request_create(text) to anon;
revoke all on function public.dpp_api_registration_request_verify(uuid) from public, anon;
grant execute on function public.dpp_api_registration_request_verify(uuid) to authenticated;
revoke all on function public.dpp_api_registration_requests_mine() from public, anon;
grant execute on function public.dpp_api_registration_requests_mine() to authenticated;
