-- A2 actor-bound RPC surface hardening acceptance.
-- Proves API roles cannot bypass wrappers and wrappers keep secure function settings.

do $test$
declare
  wrapper_count integer;
  secure_count integer;
begin
  -- Inner/unbound implementations must be unreachable from both public API roles.
  if has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_turn_save_cas_unbound(uuid,integer,uuid,text,jsonb,text,text)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_candidate_review_cas_unbound(uuid,uuid,boolean,integer,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_session_approve_cas_unbound(uuid,integer,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_manual_candidate_cas_unbound(uuid,text,text,integer,uuid)','EXECUTE')
     or has_function_privilege('anon',
       'public.dpp_api_ai_intake_turn_save_cas_unbound(uuid,integer,uuid,text,jsonb,text,text)','EXECUTE')
     or has_function_privilege('anon',
       'public.dpp_api_ai_intake_candidate_review_cas_unbound(uuid,uuid,boolean,integer,uuid)','EXECUTE')
     or has_function_privilege('anon',
       'public.dpp_api_ai_intake_session_approve_cas_unbound(uuid,integer,uuid)','EXECUTE')
     or has_function_privilege('anon',
       'public.dpp_api_ai_intake_manual_candidate_cas_unbound(uuid,text,text,integer,uuid)','EXECUTE') then
    raise exception 'API role can execute an unbound A2 inner CAS function';
  end if;

  -- Public wrappers are authenticated-only.
  if has_function_privilege('anon',
       'public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text)','EXECUTE')
     or has_function_privilege('anon',
       'public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid)','EXECUTE')
     or has_function_privilege('anon',
       'public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid)','EXECUTE')
     or has_function_privilege('anon',
       'public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid)','EXECUTE') then
    raise exception 'anon can execute an actor-bound A2 CAS wrapper';
  end if;

  if not has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_turn_save_cas(uuid,integer,uuid,text,jsonb,text,text)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_candidate_review_cas(uuid,uuid,boolean,integer,uuid)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_session_approve_cas(uuid,integer,uuid)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.dpp_api_ai_intake_manual_candidate_cas(uuid,text,text,integer,uuid)','EXECUTE') then
    raise exception 'authenticated lost access to an actor-bound A2 CAS wrapper';
  end if;

  select count(*) into wrapper_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'dpp_api_ai_intake_turn_save_cas',
      'dpp_api_ai_intake_candidate_review_cas',
      'dpp_api_ai_intake_session_approve_cas',
      'dpp_api_ai_intake_manual_candidate_cas'
    );
  if wrapper_count<>4 then
    raise exception 'Expected four actor-bound A2 CAS wrappers, got %',wrapper_count;
  end if;

  select count(*) into secure_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'dpp_api_ai_intake_turn_save_cas',
      'dpp_api_ai_intake_candidate_review_cas',
      'dpp_api_ai_intake_session_approve_cas',
      'dpp_api_ai_intake_manual_candidate_cas'
    )
    and p.prosecdef is true
    and exists (
      select 1
      from unnest(coalesce(p.proconfig,array[]::text[])) as cfg
      where cfg like 'search_path=%public%extensions%pg_temp%'
    );
  if secure_count<>4 then
    raise exception 'A2 CAS wrappers lost SECURITY DEFINER or locked search_path (%/4 secure)',secure_count;
  end if;
end
$test$;

select 'AI_ACTOR_BOUND_RPC_SURFACE_DB_PASS' as result;
