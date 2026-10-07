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
        'email',a.email,
        'company_name',a.company_name,
        'country',a.country,
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
