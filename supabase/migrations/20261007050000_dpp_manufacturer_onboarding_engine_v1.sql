-- Manufacturer Pilot V1: tenant-scoped first-login onboarding persistence and configuration.
-- Stores every answer in Supabase immediately and derives only company/workflow defaults.
-- Product-specific technical characteristics are intentionally never fabricated here.

create table if not exists public.dpp_manufacturer_onboarding_answers (
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  question_key text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  raw_answer text not null,
  structured_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, question_key),
  constraint dpp_manufacturer_onboarding_question_ck check (
    question_key in (
      'onboardingQ1','onboardingQ2','onboardingQ3','onboardingQ4',
      'onboardingQ5','onboardingQ6','onboardingQ7','onboardingQ8'
    )
  ),
  constraint dpp_manufacturer_onboarding_raw_ck check (
    char_length(btrim(raw_answer)) between 1 and 5000
  ),
  constraint dpp_manufacturer_onboarding_structured_ck check (
    jsonb_typeof(structured_value) = 'object'
  )
);

create index if not exists dpp_manufacturer_onboarding_answers_user_idx
  on public.dpp_manufacturer_onboarding_answers(user_id, updated_at desc);

create table if not exists public.dpp_manufacturer_configurations (
  organization_id uuid primary key references public.dpp_organizations(id) on delete cascade,
  status text not null default 'configured' check (status in ('configured')),
  company_identity jsonb not null default '{}'::jsonb,
  manufacturer_defaults jsonb not null default '{}'::jsonb,
  battery_preferences jsonb not null default '{}'::jsonb,
  serial_batch_workflow jsonb not null default '{}'::jsonb,
  production_scale jsonb not null default '{}'::jsonb,
  import_method jsonb not null default '{}'::jsonb,
  qr_print_method jsonb not null default '{}'::jsonb,
  configured_by uuid not null references auth.users(id) on delete restrict,
  revision integer not null default 1 check (revision >= 1),
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dpp_manufacturer_onboarding_answers enable row level security;
alter table public.dpp_manufacturer_configurations enable row level security;
revoke all on table public.dpp_manufacturer_onboarding_answers from public, anon, authenticated;
revoke all on table public.dpp_manufacturer_configurations from public, anon, authenticated;

create or replace function public.dpp_api_manufacturer_onboarding_answer_upsert(
  p_question_key text,
  p_raw_answer text,
  p_structured_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_row public.dpp_manufacturer_onboarding_answers%rowtype;
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor']);
  v_user := public.dpp_request_user_id();

  if p_question_key not in (
    'onboardingQ1','onboardingQ2','onboardingQ3','onboardingQ4',
    'onboardingQ5','onboardingQ6','onboardingQ7','onboardingQ8'
  ) then
    raise exception 'onboarding question key is invalid' using errcode='DP501';
  end if;

  if p_raw_answer is null or length(btrim(p_raw_answer)) < 1 or length(btrim(p_raw_answer)) > 5000 then
    raise exception 'onboarding answer is invalid' using errcode='DP501';
  end if;

  if p_structured_value is null then
    p_structured_value := '{}'::jsonb;
  end if;
  if jsonb_typeof(p_structured_value) <> 'object' then
    raise exception 'structured onboarding value must be an object' using errcode='DP501';
  end if;

  insert into public.dpp_manufacturer_onboarding_answers(
    organization_id,question_key,user_id,raw_answer,structured_value
  ) values (
    v_org,p_question_key,v_user,btrim(p_raw_answer),p_structured_value
  )
  on conflict (organization_id,question_key) do update
  set user_id=excluded.user_id,
      raw_answer=excluded.raw_answer,
      structured_value=excluded.structured_value,
      updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'organization_id',v_row.organization_id,
    'question_key',v_row.question_key,
    'user_id',v_row.user_id,
    'raw_answer',v_row.raw_answer,
    'structured_value',v_row.structured_value,
    'updated_at',v_row.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_manufacturer_onboarding_get()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_answers jsonb;
  v_count integer;
  v_config jsonb;
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor','viewer']);
  v_user := public.dpp_request_user_id();

  select count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'question_key',a.question_key,
               'raw_answer',a.raw_answer,
               'structured_value',a.structured_value,
               'user_id',a.user_id,
               'updated_at',a.updated_at
             ) order by a.question_key
           ),
           '[]'::jsonb
         )
  into v_count,v_answers
  from public.dpp_manufacturer_onboarding_answers a
  where a.organization_id=v_org;

  select jsonb_build_object(
    'status',c.status,
    'company_identity',c.company_identity,
    'manufacturer_defaults',c.manufacturer_defaults,
    'battery_preferences',c.battery_preferences,
    'serial_batch_workflow',c.serial_batch_workflow,
    'production_scale',c.production_scale,
    'import_method',c.import_method,
    'qr_print_method',c.qr_print_method,
    'configured_by',c.configured_by,
    'revision',c.revision,
    'configured_at',c.configured_at,
    'updated_at',c.updated_at
  )
  into v_config
  from public.dpp_manufacturer_configurations c
  where c.organization_id=v_org;

  return jsonb_build_object(
    'organization_id',v_org,
    'user_id',v_user,
    'answered_count',v_count,
    'complete',v_count=8,
    'answers',v_answers,
    'configuration',v_config
  );
end
$fn$;

create or replace function public.dpp_api_manufacturer_onboarding_configure()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_count integer;
  q1 public.dpp_manufacturer_onboarding_answers%rowtype;
  q2 public.dpp_manufacturer_onboarding_answers%rowtype;
  q3 public.dpp_manufacturer_onboarding_answers%rowtype;
  q4 public.dpp_manufacturer_onboarding_answers%rowtype;
  q5 public.dpp_manufacturer_onboarding_answers%rowtype;
  q6 public.dpp_manufacturer_onboarding_answers%rowtype;
  q7 public.dpp_manufacturer_onboarding_answers%rowtype;
  q8 public.dpp_manufacturer_onboarding_answers%rowtype;
  v_config public.dpp_manufacturer_configurations%rowtype;
begin
  v_org := public.dpp_require_active_role(array['owner','admin','editor']);
  v_user := public.dpp_request_user_id();

  select count(*)::integer into v_count
  from public.dpp_manufacturer_onboarding_answers
  where organization_id=v_org;
  if v_count <> 8 then
    raise exception 'all eight onboarding answers are required' using errcode='DP501';
  end if;

  select * into strict q1 from public.dpp_manufacturer_onboarding_answers where organization_id=v_org and question_key='onboardingQ1';
  select * into strict q2 from public.dpp_manufacturer_onboarding_answers where organization_id=v_org and question_key='onboardingQ2';
  select * into strict q3 from public.dpp_manufacturer_onboarding_answers where organization_id=v_org and question_key='onboardingQ3';
  select * into strict q4 from public.dpp_manufacturer_onboarding_answers where organization_id=v_org and question_key='onboardingQ4';
  select * into strict q5 from public.dpp_manufacturer_onboarding_answers where organization_id=v_org and question_key='onboardingQ5';
  select * into strict q6 from public.dpp_manufacturer_onboarding_answers where organization_id=v_org and question_key='onboardingQ6';
  select * into strict q7 from public.dpp_manufacturer_onboarding_answers where organization_id=v_org and question_key='onboardingQ7';
  select * into strict q8 from public.dpp_manufacturer_onboarding_answers where organization_id=v_org and question_key='onboardingQ8';

  insert into public.dpp_manufacturer_configurations(
    organization_id,status,company_identity,manufacturer_defaults,battery_preferences,
    serial_batch_workflow,production_scale,import_method,qr_print_method,configured_by
  ) values (
    v_org,
    'configured',
    q1.structured_value || jsonb_build_object('raw_answer',q1.raw_answer),
    jsonb_build_object(
      'company',q1.structured_value || jsonb_build_object('raw_answer',q1.raw_answer),
      'product_structure',q3.structured_value || jsonb_build_object('raw_answer',q3.raw_answer),
      'data_profile',q5.structured_value || jsonb_build_object('raw_answer',q5.raw_answer)
    ),
    q2.structured_value || jsonb_build_object('raw_answer',q2.raw_answer),
    q4.structured_value || jsonb_build_object('raw_answer',q4.raw_answer),
    q6.structured_value || jsonb_build_object('raw_answer',q6.raw_answer),
    q7.structured_value || jsonb_build_object('raw_answer',q7.raw_answer),
    q8.structured_value || jsonb_build_object('raw_answer',q8.raw_answer),
    v_user
  )
  on conflict (organization_id) do update
  set status='configured',
      company_identity=excluded.company_identity,
      manufacturer_defaults=excluded.manufacturer_defaults,
      battery_preferences=excluded.battery_preferences,
      serial_batch_workflow=excluded.serial_batch_workflow,
      production_scale=excluded.production_scale,
      import_method=excluded.import_method,
      qr_print_method=excluded.qr_print_method,
      configured_by=excluded.configured_by,
      revision=public.dpp_manufacturer_configurations.revision+1,
      configured_at=now(),
      updated_at=now()
  returning * into v_config;

  return jsonb_build_object(
    'organization_id',v_config.organization_id,
    'status',v_config.status,
    'revision',v_config.revision,
    'configured_at',v_config.configured_at,
    'steps',jsonb_build_array(
      jsonb_build_object('key','company','status','done'),
      jsonb_build_object('key','workflow','status','done'),
      jsonb_build_object('key','product','status','done'),
      jsonb_build_object('key','batch','status','done'),
      jsonb_build_object('key','dpp','status','done'),
      jsonb_build_object('key','qr','status','done'),
      jsonb_build_object('key','ready','status','done')
    )
  );
end
$fn$;

revoke all on function public.dpp_api_manufacturer_onboarding_answer_upsert(text,text,jsonb) from public,anon;
revoke all on function public.dpp_api_manufacturer_onboarding_get() from public,anon;
revoke all on function public.dpp_api_manufacturer_onboarding_configure() from public,anon;

grant execute on function public.dpp_api_manufacturer_onboarding_answer_upsert(text,text,jsonb) to authenticated;
grant execute on function public.dpp_api_manufacturer_onboarding_get() to authenticated;
grant execute on function public.dpp_api_manufacturer_onboarding_configure() to authenticated;

comment on function public.dpp_api_manufacturer_onboarding_answer_upsert(text,text,jsonb) is
  'Manufacturer Pilot V1: immediately persists one first-login onboarding answer in the active tenant.';
comment on function public.dpp_api_manufacturer_onboarding_get() is
  'Manufacturer Pilot V1: returns tenant-scoped onboarding progress and generated company/workflow configuration.';
comment on function public.dpp_api_manufacturer_onboarding_configure() is
  'Manufacturer Pilot V1: validates all eight answers and derives company/workflow defaults only; never fabricates product technical data.';
