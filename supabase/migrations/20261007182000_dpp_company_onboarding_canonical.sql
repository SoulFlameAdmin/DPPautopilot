-- Canonical company onboarding persistence.
-- Completed 8/8 onboarding is stored at the organization level and reused by future Early Access sessions.

create or replace function public.dpp_prefill_early_access_from_company()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_org uuid;
  v_answers jsonb;
  v_cfg jsonb;
  v_count integer;
  v_configured_at timestamptz;
begin
  if new.supabase_user_id is null then return new; end if;

  select active_organization_id
    into v_org
  from public.dpp_user_tenant_context
  where user_id=new.supabase_user_id;

  if v_org is null then return new; end if;

  select jsonb_object_agg(
           case question_key
             when 'onboardingQ1' then 'country'
             when 'onboardingQ2' then 'company'
             when 'onboardingQ3' then 'products'
             when 'onboardingQ4' then 'sku'
             when 'onboardingQ5' then 'annualVolume'
             when 'onboardingQ6' then 'users'
             when 'onboardingQ7' then 'systems'
             when 'onboardingQ8' then 'automation'
           end,
           raw_answer
         ),
         count(*)
    into v_answers,v_count
  from public.dpp_manufacturer_onboarding_answers
  where organization_id=v_org
    and question_key in (
      'onboardingQ1','onboardingQ2','onboardingQ3','onboardingQ4',
      'onboardingQ5','onboardingQ6','onboardingQ7','onboardingQ8'
    );

  if coalesce(v_count,0) <> 8 then return new; end if;

  select coalesce(manufacturer_defaults->'configuration','{}'::jsonb),configured_at
    into v_cfg,v_configured_at
  from public.dpp_manufacturer_configurations
  where organization_id=v_org;

  if v_cfg is null or v_cfg='{}'::jsonb then return new; end if;

  new.answers_json:=v_answers;
  new.configuration_json:=v_cfg;
  new.country:=coalesce(v_answers->>'country',new.country);
  new.company_name:=coalesce(v_answers->>'company',new.company_name);
  new.manufacturer:=coalesce(v_answers->>'company',new.manufacturer);
  new.configured_at:=coalesce(v_configured_at,now());
  new.submitted_at:=coalesce(new.submitted_at,now());
  new.status:='reviewing';
  return new;
end
$$;

drop trigger if exists dpp_prefill_early_access_from_company_trg
on public.dpp_early_access_sessions;

create trigger dpp_prefill_early_access_from_company_trg
before insert on public.dpp_early_access_sessions
for each row
execute function public.dpp_prefill_early_access_from_company();

create or replace function public.dpp_protect_completed_company_onboarding()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if exists (
    select 1
    from public.dpp_manufacturer_configurations c
    where c.organization_id=old.organization_id
      and c.status='configured'
  )
  and coalesce(new.structured_value->>'source','')='early_access'
  then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists dpp_protect_completed_company_onboarding_trg
on public.dpp_manufacturer_onboarding_answers;

create trigger dpp_protect_completed_company_onboarding_trg
before update on public.dpp_manufacturer_onboarding_answers
for each row
execute function public.dpp_protect_completed_company_onboarding();
