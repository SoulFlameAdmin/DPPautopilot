-- P0 truthful progress: 8/8 onboarding config is not physical battery production completion.
-- Exact body copied from bound schema after read-only pg_get_functiondef inspection;
-- only six response statuses change from done -> pending.
-- Non-destructive function replace; release behind migration/backup and independent QA gates.

CREATE OR REPLACE FUNCTION public.dpp_api_manufacturer_onboarding_configure()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      jsonb_build_object('key','workflow','status','pending'),
      jsonb_build_object('key','product','status','pending'),
      jsonb_build_object('key','batch','status','pending'),
      jsonb_build_object('key','dpp','status','pending'),
      jsonb_build_object('key','qr','status','pending'),
      jsonb_build_object('key','ready','status','pending')
    )
  );
end
$function$;

revoke all on function public.dpp_api_manufacturer_onboarding_configure() from public, anon;
grant execute on function public.dpp_api_manufacturer_onboarding_configure() to authenticated;

comment on function public.dpp_api_manufacturer_onboarding_configure() is
  'Manufacturer onboarding 8/8 only configures workspace. Product, batch, DPP, QR, ready remain PENDING until verified real entities exist.';
