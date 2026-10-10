-- PROPOSAL ONLY while Stage 1 C04 is RED.
-- AI-first A2.1: Worker-A-compatible event persistence and atomic compare-and-swap.
-- Security boundary: tenant/actor/time/event IDs are derived or issued by the server/database.
-- This migration does not create a second reducer and does not write canonical DPP/passport data.

-- Worker A can hold multiple candidates for one field so conflicts are reviewable.
alter table public.dpp_ai_intake_candidates
  drop constraint if exists dpp_ai_intake_candidates_organization_id_session_id_field_key_k;

alter table public.dpp_ai_intake_candidates
  add column if not exists source_id uuid null,
  add column if not exists anchor jsonb null;

alter table public.dpp_ai_intake_sessions
  add column if not exists approved_by uuid null references auth.users(id) on delete restrict,
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_revision integer null;

alter table public.dpp_ai_intake_sessions
  drop constraint if exists dpp_ai_intake_sessions_final_approval_ck;
alter table public.dpp_ai_intake_sessions
  add constraint dpp_ai_intake_sessions_final_approval_ck check (
    (approved_by is null and approved_at is null and approved_revision is null)
    or (approved_by is not null and approved_at is not null and approved_revision is not null and approved_revision >= 1)
  );

create table if not exists public.dpp_ai_intake_requests (
  organization_id uuid not null,
  session_id uuid not null,
  request_id uuid not null,
  request_kind text not null check (request_kind in ('turn.extract','candidate.review','session.approve','session.mode')),
  expected_revision integer not null check (expected_revision >= 0),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  first_revision integer not null check (first_revision >= 1),
  final_revision integer not null check (final_revision >= first_revision),
  response_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, session_id, request_id),
  constraint dpp_ai_intake_requests_session_fk
    foreign key (organization_id, session_id)
    references public.dpp_ai_intake_sessions(organization_id, id)
    on delete cascade
);

create table if not exists public.dpp_ai_intake_events (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null,
  request_id uuid not null,
  sequence_no integer not null check (sequence_no >= 1),
  expected_revision integer not null check (expected_revision >= 0),
  revision integer not null check (revision = expected_revision + 1),
  kind text not null check (kind in ('message.add','evidence.register','candidate.propose','candidate.review','session.mode','session.approve')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default clock_timestamp(),
  unique (organization_id, session_id, revision),
  unique (organization_id, session_id, request_id, sequence_no),
  constraint dpp_ai_intake_events_session_fk
    foreign key (organization_id, session_id)
    references public.dpp_ai_intake_sessions(organization_id, id)
    on delete cascade,
  constraint dpp_ai_intake_events_request_fk
    foreign key (organization_id, session_id, request_id)
    references public.dpp_ai_intake_requests(organization_id, session_id, request_id)
    on delete cascade
);

create index if not exists dpp_ai_intake_events_session_revision_idx
  on public.dpp_ai_intake_events(organization_id,session_id,revision);
create index if not exists dpp_ai_intake_events_actor_idx
  on public.dpp_ai_intake_events(organization_id,actor_id,occurred_at desc);

alter table public.dpp_ai_intake_requests enable row level security;
alter table public.dpp_ai_intake_events enable row level security;
revoke all on table public.dpp_ai_intake_requests from public,anon,authenticated;
revoke all on table public.dpp_ai_intake_events from public,anon,authenticated;

create policy dpp_ai_requests_member_select
on public.dpp_ai_intake_requests for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_ai_events_member_select
on public.dpp_ai_intake_events for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));

create or replace function public.dpp_ai_canonical_text(p_value text)
returns text language sql immutable security invoker set search_path=public,pg_temp
as $fn$
  select lower(regexp_replace(btrim(coalesce(p_value,'')), E'\\s+', ' ', 'g'))
$fn$;
revoke all on function public.dpp_ai_canonical_text(text) from public,anon,authenticated;

create or replace function public.dpp_ai_sha256_json(p_value jsonb)
returns text language sql immutable security definer set search_path=public,extensions,pg_temp
as $fn$
  select encode(extensions.digest(convert_to(coalesce(p_value,'null'::jsonb)::text,'UTF8'),'sha256'),'hex')
$fn$;
revoke all on function public.dpp_ai_sha256_json(jsonb) from public,anon,authenticated;

-- CAS turn persistence. One request atomically records one user message plus N model candidates.
-- request_id is an idempotency key only; message/candidate/event IDs and occurred_at are server-issued.
create or replace function public.dpp_api_ai_intake_turn_save_cas(
  p_session_id uuid,
  p_expected_revision integer,
  p_request_id uuid,
  p_prompt text,
  p_candidates jsonb,
  p_model_id text default null,
  p_source_ref text default 'conversation:prompt'
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_session public.dpp_ai_intake_sessions%rowtype;
  v_existing public.dpp_ai_intake_requests%rowtype;
  v_request_payload jsonb;
  v_request_hash text;
  v_message_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_event_time timestamptz;
  v_event_payload jsonb;
  v_event_hash text;
  v_revision integer;
  v_sequence integer := 0;
  v_candidate jsonb;
  v_candidate_id uuid;
  v_key text;
  v_value text;
  v_evidence text;
  v_candidate_ids jsonb := '[]'::jsonb;
  v_event_ids jsonb := '[]'::jsonb;
  v_response jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_request_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'CAS request id and expected revision are required' using errcode='DP501';
  end if;
  if p_prompt is null or char_length(btrim(p_prompt)) not between 1 and 20000 then
    raise exception 'AI intake prompt is invalid' using errcode='DP501';
  end if;
  if p_candidates is null or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>8 then
    raise exception 'AI intake candidates must be an array of at most eight items' using errcode='DP501';
  end if;
  if p_source_ref is null or char_length(btrim(p_source_ref)) not between 1 and 500 then
    raise exception 'AI intake source_ref is invalid' using errcode='DP501';
  end if;
  if p_model_id is not null and char_length(btrim(p_model_id)) not between 1 and 200 then
    raise exception 'AI intake model id is invalid' using errcode='DP501';
  end if;

  v_request_payload:=jsonb_build_object(
    'prompt',btrim(p_prompt),'candidates',p_candidates,
    'model_id',nullif(btrim(p_model_id),''),'source_ref',btrim(p_source_ref)
  );
  v_request_hash:=public.dpp_ai_sha256_json(v_request_payload);

  select * into v_session
  from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id and status='active'
  for update;
  if not found then raise exception 'AI intake session is missing or not active' using errcode='DP404'; end if;

  select * into v_existing
  from public.dpp_ai_intake_requests
  where organization_id=v_org and session_id=p_session_id and request_id=p_request_id;
  if found then
    if v_existing.request_kind='turn.extract'
       and v_existing.expected_revision=p_expected_revision
       and v_existing.created_by=v_user
       and v_existing.request_sha256=v_request_hash then
      return v_existing.response_json || jsonb_build_object('idempotent_retry',true);
    end if;
    raise exception 'AI request id was reused with different content' using errcode='DP409';
  end if;

  if v_session.revision<>p_expected_revision then
    raise exception 'AI intake revision conflict: expected %, actual %',p_expected_revision,v_session.revision using errcode='DP409';
  end if;

  -- Reserve the idempotency request before its event children.
  insert into public.dpp_ai_intake_requests(
    organization_id,session_id,request_id,request_kind,expected_revision,request_sha256,
    first_revision,final_revision,response_json,created_by
  ) values (
    v_org,p_session_id,p_request_id,'turn.extract',p_expected_revision,v_request_hash,
    p_expected_revision+1,p_expected_revision+1,'{}'::jsonb,v_user
  );

  v_revision:=p_expected_revision;
  v_sequence:=v_sequence+1;
  v_event_time:=clock_timestamp();
  insert into public.dpp_ai_intake_messages(
    id,organization_id,session_id,actor,content,source_ref,created_by,created_at
  ) values (
    v_message_id,v_org,p_session_id,'user',btrim(p_prompt),btrim(p_source_ref),v_user,v_event_time
  );
  v_event_payload:=jsonb_build_object('message',jsonb_build_object(
    'id',v_message_id,'role','user','text',btrim(p_prompt)
  ));
  v_event_hash:=public.dpp_ai_sha256_json(v_event_payload);
  v_event_id:=gen_random_uuid();
  insert into public.dpp_ai_intake_events(
    event_id,organization_id,session_id,request_id,sequence_no,expected_revision,revision,
    kind,actor_id,payload,payload_sha256,occurred_at
  ) values (
    v_event_id,v_org,p_session_id,p_request_id,v_sequence,v_revision,v_revision+1,
    'message.add',v_user,v_event_payload,v_event_hash,v_event_time
  );
  v_event_ids:=v_event_ids||jsonb_build_array(v_event_id);
  v_revision:=v_revision+1;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    if jsonb_typeof(v_candidate)<>'object' then
      raise exception 'AI intake candidate must be an object' using errcode='DP501';
    end if;
    v_key:=btrim(coalesce(v_candidate->>'key',''));
    v_value:=btrim(coalesce(v_candidate->>'value',''));
    v_evidence:=btrim(coalesce(v_candidate->>'evidence',''));
    if v_key not in ('country','company','products','sku','annualVolume','users','systems','automation')
       or char_length(v_value) not between 1 and 5000
       or char_length(v_evidence) not between 1 and 1000 then
      raise exception 'AI intake candidate is invalid' using errcode='DP501';
    end if;

    v_candidate_id:=gen_random_uuid();
    v_event_time:=clock_timestamp();
    delete from public.dpp_ai_intake_approvals
    where organization_id=v_org and session_id=p_session_id and field_key=v_key;

    insert into public.dpp_ai_intake_candidates(
      id,organization_id,session_id,field_key,candidate_value,evidence,
      source_type,source_ref,source_id,anchor,model_id,verification_state,
      reviewed_by,reviewed_at,created_at,updated_at
    ) values (
      v_candidate_id,v_org,p_session_id,v_key,v_value,v_evidence,
      'user',btrim(p_source_ref),v_message_id,null,nullif(btrim(p_model_id),''),'unverified',
      null,null,v_event_time,v_event_time
    );

    v_sequence:=v_sequence+1;
    v_event_payload:=jsonb_build_object('candidate',jsonb_build_object(
      'id',v_candidate_id,'field_key',v_key,'value',v_value,
      'source_type','user','source_id',v_message_id
    ));
    v_event_hash:=public.dpp_ai_sha256_json(v_event_payload);
    v_event_id:=gen_random_uuid();
    insert into public.dpp_ai_intake_events(
      event_id,organization_id,session_id,request_id,sequence_no,expected_revision,revision,
      kind,actor_id,payload,payload_sha256,occurred_at
    ) values (
      v_event_id,v_org,p_session_id,p_request_id,v_sequence,v_revision,v_revision+1,
      'candidate.propose',v_user,v_event_payload,v_event_hash,v_event_time
    );
    v_event_ids:=v_event_ids||jsonb_build_array(v_event_id);
    v_candidate_ids:=v_candidate_ids||jsonb_build_array(jsonb_build_object('key',v_key,'id',v_candidate_id));
    v_revision:=v_revision+1;
  end loop;

  update public.dpp_ai_intake_sessions
  set revision=v_revision,updated_at=clock_timestamp(),approved_by=null,approved_at=null,approved_revision=null
  where organization_id=v_org and id=p_session_id;

  v_response:=jsonb_build_object(
    'session_id',p_session_id,'request_id',p_request_id,
    'expected_revision',p_expected_revision,'revision',v_revision,
    'message_id',v_message_id,'candidate_ids',v_candidate_ids,'event_ids',v_event_ids,
    'saved_candidates',jsonb_array_length(v_candidate_ids),'verification_state','unverified',
    'canonical_answers_written',false,'can_generate_battery_passport',false,'can_publish',false,
    'idempotent_retry',false
  );

  update public.dpp_ai_intake_requests
  set final_revision=v_revision,response_json=v_response
  where organization_id=v_org and session_id=p_session_id and request_id=p_request_id;
  return v_response;
end
$fn$;

-- Candidate review with server-derived reviewer identity and atomic CAS.
create or replace function public.dpp_api_ai_intake_candidate_review_cas(
  p_session_id uuid,
  p_candidate_id uuid,
  p_accept boolean,
  p_expected_revision integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_session public.dpp_ai_intake_sessions%rowtype;
  v_existing public.dpp_ai_intake_requests%rowtype;
  v_candidate public.dpp_ai_intake_candidates%rowtype;
  v_request_payload jsonb;
  v_request_hash text;
  v_event_payload jsonb;
  v_event_id uuid;
  v_event_time timestamptz:=clock_timestamp();
  v_decision text;
  v_response jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();
  if p_candidate_id is null or p_accept is null or p_request_id is null
     or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'AI candidate review CAS input is invalid' using errcode='DP501';
  end if;

  v_request_payload:=jsonb_build_object('candidate_id',p_candidate_id,'accept',p_accept);
  v_request_hash:=public.dpp_ai_sha256_json(v_request_payload);

  select * into v_session from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id and status='active' for update;
  if not found then raise exception 'AI intake session is missing or not active' using errcode='DP404'; end if;

  select * into v_existing from public.dpp_ai_intake_requests
  where organization_id=v_org and session_id=p_session_id and request_id=p_request_id;
  if found then
    if v_existing.request_kind='candidate.review'
       and v_existing.expected_revision=p_expected_revision
       and v_existing.created_by=v_user
       and v_existing.request_sha256=v_request_hash then
      return v_existing.response_json || jsonb_build_object('idempotent_retry',true);
    end if;
    raise exception 'AI request id was reused with different content' using errcode='DP409';
  end if;
  if v_session.revision<>p_expected_revision then
    raise exception 'AI intake revision conflict' using errcode='DP409';
  end if;

  select * into v_candidate from public.dpp_ai_intake_candidates
  where organization_id=v_org and session_id=p_session_id and id=p_candidate_id;
  if not found then raise exception 'AI intake candidate not found' using errcode='DP404'; end if;
  if v_candidate.verification_state='rejected'
     or (v_candidate.verification_state='accepted' and p_accept) then
    raise exception 'AI intake candidate was already reviewed' using errcode='DP409';
  end if;

  if p_accept then
    if exists(
      select 1 from public.dpp_ai_intake_candidates c
      where c.organization_id=v_org and c.session_id=p_session_id
        and c.field_key=v_candidate.field_key and c.id<>v_candidate.id
        and c.verification_state<>'rejected'
        and public.dpp_ai_canonical_text(c.candidate_value)<>public.dpp_ai_canonical_text(v_candidate.candidate_value)
    ) then
      raise exception 'Conflicting candidate must be rejected before verification' using errcode='DP409';
    end if;
    if exists(
      select 1 from public.dpp_ai_intake_candidates c
      where c.organization_id=v_org and c.session_id=p_session_id
        and c.field_key=v_candidate.field_key and c.id<>v_candidate.id
        and c.verification_state='accepted'
    ) then
      raise exception 'Field already has a verified candidate' using errcode='DP409';
    end if;
    v_decision:='verified';
  else
    v_decision:='rejected';
  end if;

  insert into public.dpp_ai_intake_requests(
    organization_id,session_id,request_id,request_kind,expected_revision,request_sha256,
    first_revision,final_revision,response_json,created_by
  ) values (
    v_org,p_session_id,p_request_id,'candidate.review',p_expected_revision,v_request_hash,
    p_expected_revision+1,p_expected_revision+1,'{}'::jsonb,v_user
  );

  update public.dpp_ai_intake_candidates
  set verification_state=case when p_accept then 'accepted' else 'rejected' end,
      reviewed_by=v_user,reviewed_at=v_event_time,updated_at=v_event_time
  where id=v_candidate.id and organization_id=v_org;

  if p_accept then
    insert into public.dpp_ai_intake_approvals(
      organization_id,session_id,field_key,candidate_id,approved_value,approved_by,approved_at
    ) values (
      v_org,p_session_id,v_candidate.field_key,v_candidate.id,v_candidate.candidate_value,v_user,v_event_time
    )
    on conflict (organization_id,session_id,field_key) do update
    set candidate_id=excluded.candidate_id,approved_value=excluded.approved_value,
        approved_by=excluded.approved_by,approved_at=excluded.approved_at;
  else
    delete from public.dpp_ai_intake_approvals
    where organization_id=v_org and session_id=p_session_id and candidate_id=v_candidate.id;
  end if;

  v_event_payload:=jsonb_build_object(
    'candidate_id',v_candidate.id,'decision',v_decision,'reviewer_id',v_user
  );
  v_event_id:=gen_random_uuid();
  insert into public.dpp_ai_intake_events(
    event_id,organization_id,session_id,request_id,sequence_no,expected_revision,revision,
    kind,actor_id,payload,payload_sha256,occurred_at
  ) values (
    v_event_id,v_org,p_session_id,p_request_id,1,p_expected_revision,p_expected_revision+1,
    'candidate.review',v_user,v_event_payload,public.dpp_ai_sha256_json(v_event_payload),v_event_time
  );

  update public.dpp_ai_intake_sessions
  set revision=p_expected_revision+1,updated_at=v_event_time,
      approved_by=null,approved_at=null,approved_revision=null
  where organization_id=v_org and id=p_session_id;

  v_response:=jsonb_build_object(
    'session_id',p_session_id,'request_id',p_request_id,'event_id',v_event_id,
    'candidate_id',v_candidate.id,'field_key',v_candidate.field_key,
    'verification_state',case when p_accept then 'accepted' else 'rejected' end,
    'reviewed_by',v_user,'revision',p_expected_revision+1,
    'canonical_answers_written',false,'can_generate_battery_passport',false,'can_publish',false,
    'idempotent_retry',false
  );
  update public.dpp_ai_intake_requests set response_json=v_response
  where organization_id=v_org and session_id=p_session_id and request_id=p_request_id;
  return v_response;
end
$fn$;

-- Final human approval is owner/admin-only and gates onboarding configuration only.
create or replace function public.dpp_api_ai_intake_session_approve_cas(
  p_session_id uuid,
  p_expected_revision integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_session public.dpp_ai_intake_sessions%rowtype;
  v_existing public.dpp_ai_intake_requests%rowtype;
  v_request_payload jsonb;
  v_request_hash text;
  v_event_payload jsonb;
  v_event_id uuid;
  v_event_time timestamptz:=clock_timestamp();
  v_response jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin']);
  v_user:=public.dpp_request_user_id();
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'AI session approval CAS input is invalid' using errcode='DP501';
  end if;
  v_request_payload:=jsonb_build_object('session_id',p_session_id,'approve',true);
  v_request_hash:=public.dpp_ai_sha256_json(v_request_payload);

  select * into v_session from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id and status='active' for update;
  if not found then raise exception 'AI intake session is missing or not active' using errcode='DP404'; end if;

  select * into v_existing from public.dpp_ai_intake_requests
  where organization_id=v_org and session_id=p_session_id and request_id=p_request_id;
  if found then
    if v_existing.request_kind='session.approve'
       and v_existing.expected_revision=p_expected_revision
       and v_existing.created_by=v_user
       and v_existing.request_sha256=v_request_hash then
      return v_existing.response_json || jsonb_build_object('idempotent_retry',true);
    end if;
    raise exception 'AI request id was reused with different content' using errcode='DP409';
  end if;
  if v_session.revision<>p_expected_revision then
    raise exception 'AI intake revision conflict' using errcode='DP409';
  end if;

  if (select count(*) from public.dpp_ai_intake_approvals a
      where a.organization_id=v_org and a.session_id=p_session_id)<>8 then
    raise exception 'All eight onboarding fields require human verification' using errcode='DP409';
  end if;
  if exists(
    select 1
    from public.dpp_ai_intake_candidates c
    where c.organization_id=v_org and c.session_id=p_session_id and c.verification_state<>'rejected'
    group by c.field_key
    having count(distinct public.dpp_ai_canonical_text(c.candidate_value))>1
  ) then
    raise exception 'Conflicting candidate values remain unresolved' using errcode='DP409';
  end if;

  insert into public.dpp_ai_intake_requests(
    organization_id,session_id,request_id,request_kind,expected_revision,request_sha256,
    first_revision,final_revision,response_json,created_by
  ) values (
    v_org,p_session_id,p_request_id,'session.approve',p_expected_revision,v_request_hash,
    p_expected_revision+1,p_expected_revision+1,'{}'::jsonb,v_user
  );

  v_event_payload:=jsonb_build_object('reviewer_id',v_user);
  v_event_id:=gen_random_uuid();
  insert into public.dpp_ai_intake_events(
    event_id,organization_id,session_id,request_id,sequence_no,expected_revision,revision,
    kind,actor_id,payload,payload_sha256,occurred_at
  ) values (
    v_event_id,v_org,p_session_id,p_request_id,1,p_expected_revision,p_expected_revision+1,
    'session.approve',v_user,v_event_payload,public.dpp_ai_sha256_json(v_event_payload),v_event_time
  );

  update public.dpp_ai_intake_sessions
  set revision=p_expected_revision+1,updated_at=v_event_time,
      approved_by=v_user,approved_at=v_event_time,approved_revision=p_expected_revision+1
  where organization_id=v_org and id=p_session_id;

  v_response:=jsonb_build_object(
    'session_id',p_session_id,'request_id',p_request_id,'event_id',v_event_id,
    'approved_by',v_user,'approved_at',v_event_time,'revision',p_expected_revision+1,
    'can_generate_onboarding_configuration',true,
    'canonical_answers_written',false,'can_generate_battery_passport',false,'can_publish',false,
    'idempotent_retry',false
  );
  update public.dpp_ai_intake_requests set response_json=v_response
  where organization_id=v_org and session_id=p_session_id and request_id=p_request_id;
  return v_response;
end
$fn$;

-- Snapshot now exposes the append-only event stream required for deterministic Worker A replay.
create or replace function public.dpp_api_ai_intake_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_session public.dpp_ai_intake_sessions%rowtype;
  v_messages jsonb;
  v_candidates jsonb;
  v_approvals jsonb;
  v_approved_answers jsonb;
  v_approved_count integer;
  v_events jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);
  select * into v_session from public.dpp_ai_intake_sessions
  where id=p_session_id and organization_id=v_org;
  if not found then raise exception 'AI intake session not found' using errcode='DP404'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'actor',m.actor,'content',m.content,'source_ref',m.source_ref,
    'created_by',m.created_by,'created_at',m.created_at
  ) order by m.created_at,m.id),'[]'::jsonb)
  into v_messages from public.dpp_ai_intake_messages m
  where m.organization_id=v_org and m.session_id=p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'field_key',c.field_key,'value',c.candidate_value,'evidence',c.evidence,
    'source_type',c.source_type,'source_ref',c.source_ref,'source_id',c.source_id,'anchor',c.anchor,
    'model_id',c.model_id,'verification_state',c.verification_state,
    'reviewed_by',c.reviewed_by,'reviewed_at',c.reviewed_at,'created_at',c.created_at,'updated_at',c.updated_at
  ) order by c.created_at,c.id),'[]'::jsonb)
  into v_candidates from public.dpp_ai_intake_candidates c
  where c.organization_id=v_org and c.session_id=p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'field_key',a.field_key,'candidate_id',a.candidate_id,'approved_value',a.approved_value,
    'approved_by',a.approved_by,'approved_at',a.approved_at
  ) order by a.field_key),'[]'::jsonb),
  coalesce(jsonb_object_agg(a.field_key,a.approved_value),'{}'::jsonb),count(*)::integer
  into v_approvals,v_approved_answers,v_approved_count
  from public.dpp_ai_intake_approvals a
  where a.organization_id=v_org and a.session_id=p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',e.event_id,'request_id',e.request_id,'expected_revision',e.expected_revision,
    'revision',e.revision,'kind',e.kind,'actor_id',e.actor_id,'payload',e.payload,
    'sha256',e.payload_sha256,'occurred_at',e.occurred_at
  ) order by e.revision),'[]'::jsonb)
  into v_events from public.dpp_ai_intake_events e
  where e.organization_id=v_org and e.session_id=p_session_id;

  return jsonb_build_object(
    'session',jsonb_build_object(
      'id',v_session.id,'organization_id',v_session.organization_id,'created_by',v_session.created_by,
      'intake_kind',v_session.intake_kind,'status',v_session.status,'revision',v_session.revision,
      'created_at',v_session.created_at,'updated_at',v_session.updated_at,
      'approved_by',v_session.approved_by,'approved_at',v_session.approved_at,
      'approved_revision',v_session.approved_revision
    ),
    'messages',v_messages,'candidates',v_candidates,'approvals',v_approvals,
    'approved_answers',v_approved_answers,'approved_count',v_approved_count,'events',v_events,
    'canonical_answers_written',false,'can_generate_battery_passport',false,'can_publish',false
  );
end
$fn$;

-- Keep v1 calls functional during Draft integration, but route writes through CAS semantics.
create or replace function public.dpp_api_ai_intake_turn_save(
  p_session_id uuid,p_prompt text,p_candidates jsonb,p_model_id text default null,p_source_ref text default 'conversation:prompt'
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare v_org uuid; v_revision integer; begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  select revision into v_revision from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id;
  if not found then raise exception 'AI intake session not found' using errcode='DP404'; end if;
  return public.dpp_api_ai_intake_turn_save_cas(
    p_session_id,v_revision,gen_random_uuid(),p_prompt,p_candidates,p_model_id,p_source_ref
  );
end
$fn$;

create or replace function public.dpp_api_ai_intake_candidate_review(
  p_session_id uuid,p_field_key text,p_approved_value text,p_accept boolean
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fn$
declare v_org uuid; v_revision integer; v_candidate_id uuid; v_value text; begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  select revision into v_revision from public.dpp_ai_intake_sessions
  where organization_id=v_org and id=p_session_id;
  if not found then raise exception 'AI intake session not found' using errcode='DP404'; end if;
  select id,candidate_value into v_candidate_id,v_value from public.dpp_ai_intake_candidates
  where organization_id=v_org and session_id=p_session_id and field_key=p_field_key
    and verification_state='unverified'
  order by created_at desc,id desc limit 1;
  if not found then raise exception 'AI intake candidate not found' using errcode='DP404'; end if;
  if p_accept and public.dpp_ai_canonical_text(p_approved_value)<>public.dpp_ai_canonical_text(v_value) then
    raise exception 'Edited value requires a new manual candidate' using errcode='DP409';
  end if;
  return public.dpp_api_ai_intake_candidate_review_cas(
    p_session_id,v_candidate_id,p_accept,v_revision,gen_random_uuid()
  );
end
$fn$;

revoke all on function public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text) from public,anon;
revoke all on function public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid) from public,anon;
revoke all on function public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid) from public,anon;
revoke all on function public.dpp_api_ai_intake_snapshot(uuid) from public,anon;
grant execute on function public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text) to authenticated;
grant execute on function public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid) to authenticated;
grant execute on function public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid) to authenticated;
grant execute on function public.dpp_api_ai_intake_snapshot(uuid) to authenticated;

comment on table public.dpp_ai_intake_events is
  'Append-only Worker A event envelope. Tenant, actor, timestamps and event IDs are DB/server authority.';
comment on function public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text) is
  'Atomically persists one user prompt plus unverified AI candidates using revision CAS and idempotency request key.';
comment on function public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid) is
  'Server-derived reviewer identity with conflict-aware candidate review and atomic revision CAS.';
comment on function public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid) is
  'Owner/admin final approval for onboarding configuration only. Never authorizes Battery DPP generation or publication.';
