-- PROPOSAL ONLY while the Stage 1 C04 live migration gate is RED.
-- AI-first A2 persistence: resumable tenant-scoped intake sessions, conversation turns,
-- evidence-bound candidates, and explicit human approvals.
-- This migration intentionally does NOT write manufacturer onboarding answers,
-- create products/items/passports, activate passports, or publish any DPP data.

create table if not exists public.dpp_ai_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  intake_kind text not null default 'manufacturer_onboarding'
    check (intake_kind in ('manufacturer_onboarding')),
  status text not null default 'active'
    check (status in ('active','completed','abandoned')),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (organization_id, id),
  constraint dpp_ai_intake_session_completion_ck check (
    (status='completed' and completed_at is not null)
    or (status<>'completed' and completed_at is null)
  )
);

create unique index if not exists dpp_ai_intake_one_active_per_user_kind_idx
  on public.dpp_ai_intake_sessions(organization_id, created_by, intake_kind)
  where status='active';

create index if not exists dpp_ai_intake_sessions_org_updated_idx
  on public.dpp_ai_intake_sessions(organization_id, updated_at desc);

create table if not exists public.dpp_ai_intake_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null,
  actor text not null check (actor in ('user','assistant')),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  source_ref text not null check (char_length(btrim(source_ref)) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint dpp_ai_intake_messages_session_fk
    foreign key (organization_id, session_id)
    references public.dpp_ai_intake_sessions(organization_id, id)
    on delete cascade
);

create index if not exists dpp_ai_intake_messages_session_created_idx
  on public.dpp_ai_intake_messages(organization_id, session_id, created_at, id);

create table if not exists public.dpp_ai_intake_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null,
  field_key text not null check (
    field_key in ('country','company','products','sku','annualVolume','users','systems','automation')
  ),
  candidate_value text not null check (char_length(btrim(candidate_value)) between 1 and 5000),
  evidence text not null check (char_length(btrim(evidence)) between 1 and 1000),
  source_type text not null check (source_type in ('user','document','system','integration')),
  source_ref text not null check (char_length(btrim(source_ref)) between 1 and 500),
  model_id text null check (model_id is null or char_length(btrim(model_id)) between 1 and 200),
  verification_state text not null default 'unverified'
    check (verification_state in ('unverified','accepted','rejected')),
  reviewed_by uuid null references auth.users(id) on delete restrict,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, session_id, field_key),
  constraint dpp_ai_intake_candidates_session_fk
    foreign key (organization_id, session_id)
    references public.dpp_ai_intake_sessions(organization_id, id)
    on delete cascade,
  constraint dpp_ai_intake_candidates_review_ck check (
    (verification_state='unverified' and reviewed_by is null and reviewed_at is null)
    or (verification_state in ('accepted','rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists dpp_ai_intake_candidates_session_state_idx
  on public.dpp_ai_intake_candidates(organization_id, session_id, verification_state, field_key);

create table if not exists public.dpp_ai_intake_approvals (
  organization_id uuid not null,
  session_id uuid not null,
  field_key text not null check (
    field_key in ('country','company','products','sku','annualVolume','users','systems','automation')
  ),
  candidate_id uuid not null references public.dpp_ai_intake_candidates(id) on delete cascade,
  approved_value text not null check (char_length(btrim(approved_value)) between 1 and 5000),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  primary key (organization_id, session_id, field_key),
  constraint dpp_ai_intake_approvals_session_fk
    foreign key (organization_id, session_id)
    references public.dpp_ai_intake_sessions(organization_id, id)
    on delete cascade
);

create index if not exists dpp_ai_intake_approvals_session_idx
  on public.dpp_ai_intake_approvals(organization_id, session_id, approved_at, field_key);

alter table public.dpp_ai_intake_sessions enable row level security;
alter table public.dpp_ai_intake_messages enable row level security;
alter table public.dpp_ai_intake_candidates enable row level security;
alter table public.dpp_ai_intake_approvals enable row level security;

revoke all on table public.dpp_ai_intake_sessions from public, anon, authenticated;
revoke all on table public.dpp_ai_intake_messages from public, anon, authenticated;
revoke all on table public.dpp_ai_intake_candidates from public, anon, authenticated;
revoke all on table public.dpp_ai_intake_approvals from public, anon, authenticated;

-- Defense in depth. The normal application surface uses the checked RPCs below;
-- direct table privileges remain revoked.
create policy dpp_ai_sessions_member_select
on public.dpp_ai_intake_sessions for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_ai_sessions_editor_insert
on public.dpp_ai_intake_sessions for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_ai_sessions_editor_update
on public.dpp_ai_intake_sessions for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_ai_sessions_admin_delete
on public.dpp_ai_intake_sessions for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_ai_messages_member_select
on public.dpp_ai_intake_messages for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_ai_messages_editor_insert
on public.dpp_ai_intake_messages for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_ai_messages_admin_delete
on public.dpp_ai_intake_messages for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_ai_candidates_member_select
on public.dpp_ai_intake_candidates for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_ai_candidates_editor_insert
on public.dpp_ai_intake_candidates for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_ai_candidates_editor_update
on public.dpp_ai_intake_candidates for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_ai_candidates_admin_delete
on public.dpp_ai_intake_candidates for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_ai_approvals_member_select
on public.dpp_ai_intake_approvals for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_ai_approvals_editor_insert
on public.dpp_ai_intake_approvals for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_ai_approvals_editor_update
on public.dpp_ai_intake_approvals for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_ai_approvals_admin_delete
on public.dpp_ai_intake_approvals for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create or replace function public.dpp_api_ai_intake_resume_or_create()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_session public.dpp_ai_intake_sessions%rowtype;
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor']);
  v_user := public.dpp_request_user_id();

  insert into public.dpp_ai_intake_sessions(
    organization_id, created_by, intake_kind, status
  ) values (
    v_org, v_user, 'manufacturer_onboarding', 'active'
  )
  on conflict (organization_id, created_by, intake_kind) where status='active'
  do update set updated_at=now()
  returning * into v_session;

  return jsonb_build_object(
    'id',v_session.id,
    'organization_id',v_session.organization_id,
    'created_by',v_session.created_by,
    'intake_kind',v_session.intake_kind,
    'status',v_session.status,
    'revision',v_session.revision,
    'updated_at',v_session.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_ai_intake_turn_save(
  p_session_id uuid,
  p_prompt text,
  p_candidates jsonb,
  p_model_id text default null,
  p_source_ref text default 'conversation:prompt'
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_candidate jsonb;
  v_key text;
  v_value text;
  v_evidence text;
  v_source_type text;
  v_source_ref text;
  v_count integer := 0;
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor']);
  v_user := public.dpp_request_user_id();

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

  if not exists(
    select 1 from public.dpp_ai_intake_sessions s
    where s.id=p_session_id and s.organization_id=v_org and s.status='active'
  ) then
    raise exception 'AI intake session is missing or not active' using errcode='DP404';
  end if;

  insert into public.dpp_ai_intake_messages(
    organization_id,session_id,actor,content,source_ref,created_by
  ) values (
    v_org,p_session_id,'user',btrim(p_prompt),btrim(p_source_ref),v_user
  );

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    if jsonb_typeof(v_candidate)<>'object' then
      raise exception 'AI intake candidate must be an object' using errcode='DP501';
    end if;
    v_key:=btrim(coalesce(v_candidate->>'key',''));
    v_value:=btrim(coalesce(v_candidate->>'value',''));
    v_evidence:=btrim(coalesce(v_candidate->>'evidence',''));
    v_source_type:=btrim(coalesce(v_candidate->>'source_type','user'));
    v_source_ref:=btrim(coalesce(v_candidate->>'source_ref',p_source_ref));

    if v_key not in ('country','company','products','sku','annualVolume','users','systems','automation')
       or char_length(v_value) not between 1 and 5000
       or char_length(v_evidence) not between 1 and 1000
       or v_source_type not in ('user','document','system','integration')
       or char_length(v_source_ref) not between 1 and 500 then
      raise exception 'AI intake candidate is invalid' using errcode='DP501';
    end if;

    insert into public.dpp_ai_intake_candidates(
      organization_id,session_id,field_key,candidate_value,evidence,
      source_type,source_ref,model_id,verification_state,reviewed_by,reviewed_at
    ) values (
      v_org,p_session_id,v_key,v_value,v_evidence,
      v_source_type,v_source_ref,nullif(btrim(p_model_id),''),'unverified',null,null
    )
    on conflict (organization_id,session_id,field_key) do update
    set candidate_value=excluded.candidate_value,
        evidence=excluded.evidence,
        source_type=excluded.source_type,
        source_ref=excluded.source_ref,
        model_id=excluded.model_id,
        verification_state='unverified',
        reviewed_by=null,
        reviewed_at=null,
        updated_at=now();

    delete from public.dpp_ai_intake_approvals a
    where a.organization_id=v_org
      and a.session_id=p_session_id
      and a.field_key=v_key;

    v_count:=v_count+1;
  end loop;

  update public.dpp_ai_intake_sessions
  set revision=revision+1, updated_at=now()
  where id=p_session_id and organization_id=v_org;

  return jsonb_build_object(
    'session_id',p_session_id,
    'saved_candidates',v_count,
    'verification_state','unverified',
    'canonical_answers_written',false,
    'can_publish',false
  );
end
$fn$;

create or replace function public.dpp_api_ai_intake_candidate_review(
  p_session_id uuid,
  p_field_key text,
  p_approved_value text,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_candidate public.dpp_ai_intake_candidates%rowtype;
  v_state text;
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor']);
  v_user := public.dpp_request_user_id();

  if p_field_key not in ('country','company','products','sku','annualVolume','users','systems','automation') then
    raise exception 'AI intake field key is invalid' using errcode='DP501';
  end if;
  if p_accept is null then
    raise exception 'AI intake review decision is required' using errcode='DP501';
  end if;
  if p_accept and (p_approved_value is null or char_length(btrim(p_approved_value)) not between 1 and 5000) then
    raise exception 'Approved AI intake value is invalid' using errcode='DP501';
  end if;

  select * into v_candidate
  from public.dpp_ai_intake_candidates c
  where c.organization_id=v_org
    and c.session_id=p_session_id
    and c.field_key=p_field_key;

  if not found then
    raise exception 'AI intake candidate not found' using errcode='DP404';
  end if;

  if p_accept then
    insert into public.dpp_ai_intake_approvals(
      organization_id,session_id,field_key,candidate_id,approved_value,approved_by,approved_at
    ) values (
      v_org,p_session_id,p_field_key,v_candidate.id,btrim(p_approved_value),v_user,now()
    )
    on conflict (organization_id,session_id,field_key) do update
    set candidate_id=excluded.candidate_id,
        approved_value=excluded.approved_value,
        approved_by=excluded.approved_by,
        approved_at=excluded.approved_at;
    v_state:='accepted';
  else
    delete from public.dpp_ai_intake_approvals
    where organization_id=v_org and session_id=p_session_id and field_key=p_field_key;
    v_state:='rejected';
  end if;

  update public.dpp_ai_intake_candidates
  set verification_state=v_state,
      reviewed_by=v_user,
      reviewed_at=now(),
      updated_at=now()
  where id=v_candidate.id and organization_id=v_org;

  update public.dpp_ai_intake_sessions
  set revision=revision+1, updated_at=now()
  where id=p_session_id and organization_id=v_org;

  return jsonb_build_object(
    'session_id',p_session_id,
    'field_key',p_field_key,
    'verification_state',v_state,
    'approved_value',case when p_accept then btrim(p_approved_value) else null end,
    'reviewed_by',v_user,
    'canonical_answers_written',false,
    'can_publish',false
  );
end
$fn$;

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
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select * into v_session
  from public.dpp_ai_intake_sessions s
  where s.id=p_session_id and s.organization_id=v_org;
  if not found then
    raise exception 'AI intake session not found' using errcode='DP404';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'actor',m.actor,'content',m.content,'source_ref',m.source_ref,
    'created_by',m.created_by,'created_at',m.created_at
  ) order by m.created_at,m.id),'[]'::jsonb)
  into v_messages
  from public.dpp_ai_intake_messages m
  where m.organization_id=v_org and m.session_id=p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'field_key',c.field_key,'value',c.candidate_value,
    'evidence',c.evidence,'source_type',c.source_type,'source_ref',c.source_ref,
    'model_id',c.model_id,'verification_state',c.verification_state,
    'reviewed_by',c.reviewed_by,'reviewed_at',c.reviewed_at,'updated_at',c.updated_at
  ) order by c.field_key),'[]'::jsonb)
  into v_candidates
  from public.dpp_ai_intake_candidates c
  where c.organization_id=v_org and c.session_id=p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'field_key',a.field_key,'candidate_id',a.candidate_id,'approved_value',a.approved_value,
    'approved_by',a.approved_by,'approved_at',a.approved_at
  ) order by a.field_key),'[]'::jsonb),
  coalesce(jsonb_object_agg(a.field_key,a.approved_value),'{}'::jsonb)
  into v_approvals,v_approved_answers
  from public.dpp_ai_intake_approvals a
  where a.organization_id=v_org and a.session_id=p_session_id;

  return jsonb_build_object(
    'session',jsonb_build_object(
      'id',v_session.id,'organization_id',v_session.organization_id,
      'created_by',v_session.created_by,'intake_kind',v_session.intake_kind,
      'status',v_session.status,'revision',v_session.revision,
      'created_at',v_session.created_at,'updated_at',v_session.updated_at
    ),
    'messages',v_messages,
    'candidates',v_candidates,
    'approvals',v_approvals,
    'approved_answers',v_approved_answers,
    'approved_count',jsonb_object_length(v_approved_answers),
    'canonical_answers_written',false,
    'can_publish',false
  );
end
$fn$;

revoke all on function public.dpp_api_ai_intake_resume_or_create() from public,anon;
revoke all on function public.dpp_api_ai_intake_turn_save(uuid,text,jsonb,text,text) from public,anon;
revoke all on function public.dpp_api_ai_intake_candidate_review(uuid,text,text,boolean) from public,anon;
revoke all on function public.dpp_api_ai_intake_snapshot(uuid) from public,anon;

grant execute on function public.dpp_api_ai_intake_resume_or_create() to authenticated;
grant execute on function public.dpp_api_ai_intake_turn_save(uuid,text,jsonb,text,text) to authenticated;
grant execute on function public.dpp_api_ai_intake_candidate_review(uuid,text,text,boolean) to authenticated;
grant execute on function public.dpp_api_ai_intake_snapshot(uuid) to authenticated;

comment on table public.dpp_ai_intake_sessions is
  'AI-first resumable intake sessions. No canonical DPP write or publication side effect.';
comment on table public.dpp_ai_intake_candidates is
  'Model-extracted candidate values with evidence/provenance. Candidates are not verified facts.';
comment on table public.dpp_ai_intake_approvals is
  'Explicit human-approved intake values kept separately from model suggestions.';
comment on function public.dpp_api_ai_intake_turn_save(uuid,text,jsonb,text,text) is
  'Persists one AI intake prompt and unverified candidates only. Never writes canonical onboarding or DPP data.';
comment on function public.dpp_api_ai_intake_candidate_review(uuid,text,text,boolean) is
  'Records explicit human accept/reject review separately from the original AI candidate.';
