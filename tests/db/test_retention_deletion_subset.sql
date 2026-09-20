-- R08 retention/deletion precursor integration subset.
-- CI runs this inside a transaction and rolls it back.

do $seed$
declare
  u_owner uuid := 'e1111111-1111-4111-8111-111111111111';
  u_admin uuid := 'e2222222-2222-4222-8222-222222222222';
  u_viewer uuid := 'e3333333-3333-4333-8333-333333333333';
  org_a uuid := 'e4444444-4444-4444-8444-444444444444';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_admin,u_viewer
    );
  else
    insert into auth.users(id) values (u_owner),(u_admin),(u_viewer);
  end if;

  insert into public.dpp_organizations(id,name,slug)
  values (org_a,'R08 Retention Org','r08-retention-org');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_admin,'admin'),
    (org_a,u_viewer,'viewer');
end
$seed$;

do $r08$
declare
  org_a uuid := 'e4444444-4444-4444-8444-444444444444';
  old_committed uuid := 'e5555555-5555-4555-8555-555555555551';
  old_invalid uuid := 'e5555555-5555-4555-8555-555555555552';
  old_staged uuid := 'e5555555-5555-4555-8555-555555555553';
  old_validated uuid := 'e5555555-5555-4555-8555-555555555554';
  recent_committed uuid := 'e5555555-5555-4555-8555-555555555555';
  status_payload jsonb;
  impact_payload jsonb;
  purge_payload jsonb;
  seen boolean;
  deleted_audit integer;
begin
  perform set_config('request.jwt.claim.sub','e1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  insert into public.dpp_import_runs(
    id,organization_id,status,row_count,error_count,created_by,created_at,updated_at
  ) values
    (old_committed,org_a,'committed',1,0,'e1111111-1111-4111-8111-111111111111',now()-interval '45 days',now()-interval '45 days'),
    (old_invalid,org_a,'invalid',1,1,'e1111111-1111-4111-8111-111111111111',now()-interval '44 days',now()-interval '44 days'),
    (old_staged,org_a,'staged',0,0,'e1111111-1111-4111-8111-111111111111',now()-interval '43 days',now()-interval '43 days'),
    (old_validated,org_a,'validated',1,0,'e1111111-1111-4111-8111-111111111111',now()-interval '42 days',now()-interval '42 days'),
    (recent_committed,org_a,'committed',1,0,'e1111111-1111-4111-8111-111111111111',now()-interval '10 days',now()-interval '10 days');

  insert into public.dpp_import_rows(
    import_id,row_number,normalized_model,normalized_item,validation_errors
  ) values
    (old_committed,1,'{"model_identifier":"R08-A","manufacturer_name":"R08","category":"portable"}'::jsonb,'{"unique_identifier":"urn:dpp:r08:a"}'::jsonb,'[]'::jsonb),
    (old_invalid,1,'{"model_identifier":"R08-B","manufacturer_name":"R08","category":"portable"}'::jsonb,'{"unique_identifier":"urn:dpp:r08:b"}'::jsonb,'[{"code":"invalid"}]'::jsonb),
    (old_staged,1,'{"model_identifier":"R08-C","manufacturer_name":"R08","category":"portable"}'::jsonb,'{"unique_identifier":"urn:dpp:r08:c"}'::jsonb,'[]'::jsonb),
    (old_validated,1,'{"model_identifier":"R08-D","manufacturer_name":"R08","category":"portable"}'::jsonb,'{"unique_identifier":"urn:dpp:r08:d"}'::jsonb,'[]'::jsonb),
    (recent_committed,1,'{"model_identifier":"R08-E","manufacturer_name":"R08","category":"portable"}'::jsonb,'{"unique_identifier":"urn:dpp:r08:e"}'::jsonb,'[]'::jsonb);

  status_payload:=public.dpp_api_retention_status();

  if coalesce((status_payload->>'organization_deletion_enabled')::boolean,true) then
    raise exception 'R08 organization deletion must remain fail-closed';
  end if;
  if coalesce((status_payload->'import_staging'->>'minimum_age_days')::int,0)<>30 then
    raise exception 'R08 retention minimum age mismatch: %',status_payload;
  end if;
  if coalesce((status_payload->'import_staging'->>'eligible_terminal_runs')::int,0)<>2 then
    raise exception 'R08 eligible terminal count mismatch: %',status_payload;
  end if;
  if coalesce((status_payload->'import_staging'->>'old_nonterminal_runs_preserved')::int,0)<>2 then
    raise exception 'R08 old nonterminal count mismatch: %',status_payload;
  end if;
  if jsonb_array_length(status_payload->'blockers')<6 then
    raise exception 'R08 deletion blockers unexpectedly incomplete: %',status_payload;
  end if;

  impact_payload:=public.dpp_api_org_deletion_impact();
  if coalesce((impact_payload->>'preview_only')::boolean,false) is not true
     or coalesce((impact_payload->>'ready_for_destructive_delete')::boolean,true) is not false
     or coalesce((impact_payload->>'destructive_surface_available')::boolean,true) is not false then
    raise exception 'R08 deletion impact preview is not fail-closed: %',impact_payload;
  end if;
  if coalesce((impact_payload->'counts'->>'organization_members')::int,0)<>3
     or coalesce((impact_payload->'counts'->>'distinct_member_users')::int,0)<>3
     or coalesce((impact_payload->'counts'->>'active_tenant_contexts')::int,0)<>1
     or coalesce((impact_payload->'counts'->>'import_runs')::int,0)<>5
     or coalesce((impact_payload->'counts'->>'import_rows')::int,0)<>5 then
    raise exception 'R08 deletion impact counts mismatch: %',impact_payload;
  end if;
  if coalesce((impact_payload->'external_objects'->>'storage_enumeration_required_before_delete')::boolean,false) is not true
     or coalesce((impact_payload->'identity_boundary'->>'auth_users_deleted_by_org_delete')::boolean,true) is not false
     or jsonb_array_length(impact_payload->'blocker_codes')<>6 then
    raise exception 'R08 deletion impact safety boundary mismatch: %',impact_payload;
  end if;

  -- Too-recent cutoff must fail closed.
  seen:=false;
  begin
    perform public.dpp_api_purge_import_staging(now()-interval '29 days');
  exception when sqlstate 'DP502' then seen:=true;
  end;
  if not seen then raise exception 'R08 accepted cutoff younger than 30 days'; end if;

  purge_payload:=public.dpp_api_purge_import_staging(now()-interval '30 days');

  if coalesce((purge_payload->>'deleted_runs')::int,0)<>2 then
    raise exception 'R08 deleted run count mismatch: %',purge_payload;
  end if;

  if exists(select 1 from public.dpp_import_runs where id in (old_committed,old_invalid)) then
    raise exception 'R08 terminal old imports were not purged';
  end if;

  if not exists(select 1 from public.dpp_import_runs where id=old_staged)
     or not exists(select 1 from public.dpp_import_runs where id=old_validated)
     or not exists(select 1 from public.dpp_import_runs where id=recent_committed) then
    raise exception 'R08 preserved imports were incorrectly deleted';
  end if;

  if exists(select 1 from public.dpp_import_rows where import_id in (old_committed,old_invalid)) then
    raise exception 'R08 cascaded import rows survived terminal run purge';
  end if;

  select count(*) into deleted_audit
  from public.dpp_audit_log
  where organization_id=org_a
    and target_table='dpp_import_runs'
    and action='DELETE'
    and target_id in (old_committed,old_invalid);

  if deleted_audit<>2 then
    raise exception 'R08 immutable audit trail missing purge deletes: %',deleted_audit;
  end if;

  -- Viewer may not inspect deletion readiness or purge.
  perform set_config('request.jwt.claim.sub','e3333333-3333-4333-8333-333333333333',true);
  perform public.dpp_set_active_organization(org_a);

  seen:=false;
  begin
    perform public.dpp_api_retention_status();
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'R08 viewer retention status was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_purge_import_staging(now()-interval '31 days');
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'R08 viewer purge was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_org_deletion_impact();
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'R08 viewer deletion impact preview was not denied'; end if;

  -- Admin is accepted.
  perform set_config('request.jwt.claim.sub','e2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  status_payload:=public.dpp_api_retention_status();
  impact_payload:=public.dpp_api_org_deletion_impact();
  if impact_payload->>'organization_id'<>org_a::text then
    raise exception 'R08 admin deletion impact wrong tenant';
  end if;
  if status_payload->>'organization_id'<>org_a::text then
    raise exception 'R08 admin retention status wrong tenant';
  end if;

  -- Organization deletion must remain impossible while retention blockers are unresolved.
  if has_table_privilege('authenticated','public.dpp_organizations','DELETE')
     or has_table_privilege('anon','public.dpp_organizations','DELETE')
     or to_regprocedure('public.dpp_api_organizations_delete(uuid)') is not null then
    raise exception 'R08 destructive org deletion surface unexpectedly available';
  end if;

  if has_function_privilege('anon','public.dpp_api_retention_status()','EXECUTE')
     or has_function_privilege('anon','public.dpp_api_purge_import_staging(timestamptz)','EXECUTE')
     or has_function_privilege('anon','public.dpp_api_org_deletion_impact()','EXECUTE') then
    raise exception 'R08 retention RPC leaked anon EXECUTE';
  end if;

  if not has_function_privilege('authenticated','public.dpp_api_retention_status()','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_purge_import_staging(timestamptz)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_org_deletion_impact()','EXECUTE') then
    raise exception 'R08 retention RPC missing authenticated EXECUTE';
  end if;
end
$r08$;

select 'R08_RETENTION_DELETION_SUBSET_PASS' as result;
