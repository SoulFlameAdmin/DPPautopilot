create table if not exists public.dpp_client_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  company_name text not null,
  contact_name text not null default '',
  country text not null default '',
  website text,
  employees_count integer,
  dpp_users_count integer,
  production_sites_count integer,
  systems jsonb not null default '[]'::jsonb,
  product_categories text not null default '',
  sku_count integer,
  annual_units bigint,
  notes text not null default '',
  status text not null default 'submitted',
  quote_setup_eur numeric(12,2),
  quote_monthly_eur numeric(12,2),
  organization_id uuid references public.dpp_organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpp_client_applications_company_name_ck check (char_length(btrim(company_name)) between 1 and 200),
  constraint dpp_client_applications_contact_name_ck check (char_length(contact_name) <= 200),
  constraint dpp_client_applications_country_ck check (char_length(country) <= 120),
  constraint dpp_client_applications_website_ck check (website is null or char_length(website) <= 500),
  constraint dpp_client_applications_employees_ck check (employees_count is null or employees_count between 1 and 1000000),
  constraint dpp_client_applications_users_ck check (dpp_users_count is null or dpp_users_count between 1 and 1000000),
  constraint dpp_client_applications_sites_ck check (production_sites_count is null or production_sites_count between 0 and 100000),
  constraint dpp_client_applications_systems_ck check (jsonb_typeof(systems)='array' and jsonb_array_length(systems) <= 30),
  constraint dpp_client_applications_product_categories_ck check (char_length(product_categories) <= 2000),
  constraint dpp_client_applications_sku_ck check (sku_count is null or sku_count between 0 and 100000000),
  constraint dpp_client_applications_units_ck check (annual_units is null or annual_units between 0 and 1000000000000),
  constraint dpp_client_applications_notes_ck check (char_length(notes) <= 5000),
  constraint dpp_client_applications_status_ck check (status in ('submitted','reviewing','quoted','awaiting_payment','paid','activated','rejected'))
);

create index if not exists dpp_client_applications_user_idx
  on public.dpp_client_applications(user_id, created_at desc);
create index if not exists dpp_client_applications_status_idx
  on public.dpp_client_applications(status, created_at desc);

alter table public.dpp_client_applications enable row level security;
revoke all on table public.dpp_client_applications from anon, authenticated;

create or replace function public.dpp_api_client_application_submit(
  p_company_name text,
  p_contact_name text default '',
  p_country text default '',
  p_website text default null,
  p_employees_count integer default null,
  p_dpp_users_count integer default null,
  p_production_sites_count integer default null,
  p_systems jsonb default '[]'::jsonb,
  p_product_categories text default '',
  p_sku_count integer default null,
  p_annual_units bigint default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid;
  v_email text;
  v_id uuid;
  v_created_at timestamptz;
  v_updated_at timestamptz;
begin
  v_user := public.dpp_request_user_id();
  if v_user is null then
    raise exception 'authenticated user context is required' using errcode='DP101';
  end if;

  select email into v_email from auth.users where id=v_user;
  if v_email is null or length(v_email) > 320 then
    raise exception 'verified email is required' using errcode='DP101';
  end if;

  if p_company_name is null or length(btrim(p_company_name)) < 1 or length(btrim(p_company_name)) > 200 then
    raise exception 'company name is invalid' using errcode='DP501';
  end if;
  if coalesce(length(p_contact_name),0) > 200 or coalesce(length(p_country),0) > 120 or
     coalesce(length(p_product_categories),0) > 2000 or coalesce(length(p_notes),0) > 5000 then
    raise exception 'application text is invalid' using errcode='DP501';
  end if;
  if p_website is not null and length(p_website) > 500 then
    raise exception 'website is invalid' using errcode='DP501';
  end if;
  if p_employees_count is not null and (p_employees_count < 1 or p_employees_count > 1000000) then
    raise exception 'employees count is invalid' using errcode='DP501';
  end if;
  if p_dpp_users_count is not null and (p_dpp_users_count < 1 or p_dpp_users_count > 1000000) then
    raise exception 'DPP users count is invalid' using errcode='DP501';
  end if;
  if p_production_sites_count is not null and (p_production_sites_count < 0 or p_production_sites_count > 100000) then
    raise exception 'production sites count is invalid' using errcode='DP501';
  end if;
  if p_sku_count is not null and (p_sku_count < 0 or p_sku_count > 100000000) then
    raise exception 'SKU count is invalid' using errcode='DP501';
  end if;
  if p_annual_units is not null and (p_annual_units < 0 or p_annual_units > 1000000000000) then
    raise exception 'annual units count is invalid' using errcode='DP501';
  end if;
  if p_systems is null or jsonb_typeof(p_systems) <> 'array' or jsonb_array_length(p_systems) > 30 then
    raise exception 'systems list is invalid' using errcode='DP501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_systems) x
    where jsonb_typeof(x) <> 'string' or length(trim(both '"' from x::text)) > 120
  ) then
    raise exception 'systems list is invalid' using errcode='DP501';
  end if;

  select id into v_id
  from public.dpp_client_applications
  where user_id=v_user
    and lower(company_name)=lower(btrim(p_company_name))
    and status in ('submitted','reviewing')
  order by created_at desc
  limit 1;

  if v_id is null then
    insert into public.dpp_client_applications(
      user_id,email,company_name,contact_name,country,website,employees_count,dpp_users_count,
      production_sites_count,systems,product_categories,sku_count,annual_units,notes,status
    ) values (
      v_user,v_email,btrim(p_company_name),btrim(coalesce(p_contact_name,'')),btrim(coalesce(p_country,'')),
      nullif(btrim(coalesce(p_website,'')),''),
      p_employees_count,p_dpp_users_count,p_production_sites_count,p_systems,
      btrim(coalesce(p_product_categories,'')),p_sku_count,p_annual_units,btrim(coalesce(p_notes,'')),'submitted'
    )
    returning id,created_at,updated_at into v_id,v_created_at,v_updated_at;
  else
    update public.dpp_client_applications
    set email=v_email,
        contact_name=btrim(coalesce(p_contact_name,'')),
        country=btrim(coalesce(p_country,'')),
        website=nullif(btrim(coalesce(p_website,'')),''),
        employees_count=p_employees_count,
        dpp_users_count=p_dpp_users_count,
        production_sites_count=p_production_sites_count,
        systems=p_systems,
        product_categories=btrim(coalesce(p_product_categories,'')),
        sku_count=p_sku_count,
        annual_units=p_annual_units,
        notes=btrim(coalesce(p_notes,'')),
        updated_at=now()
    where id=v_id
    returning created_at,updated_at into v_created_at,v_updated_at;
  end if;

  return jsonb_build_object(
    'application_id',v_id,
    'email',v_email,
    'company_name',btrim(p_company_name),
    'status','submitted',
    'created_at',v_created_at,
    'updated_at',v_updated_at
  );
end
$function$;

create or replace function public.dpp_api_client_applications_mine()
returns jsonb
language sql
security definer
set search_path to 'public','pg_temp'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'application_id',a.id,
        'company_name',a.company_name,
        'status',a.status,
        'quote_setup_eur',a.quote_setup_eur,
        'quote_monthly_eur',a.quote_monthly_eur,
        'created_at',a.created_at,
        'updated_at',a.updated_at
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
  from public.dpp_client_applications a
  where a.user_id=public.dpp_request_user_id()
$function$;

revoke all on function public.dpp_api_client_application_submit(text,text,text,text,integer,integer,integer,jsonb,text,integer,bigint,text) from public, anon;
grant execute on function public.dpp_api_client_application_submit(text,text,text,text,integer,integer,integer,jsonb,text,integer,bigint,text) to authenticated;
revoke all on function public.dpp_api_client_applications_mine() from public, anon;
grant execute on function public.dpp_api_client_applications_mine() to authenticated;
