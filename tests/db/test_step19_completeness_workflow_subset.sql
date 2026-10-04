-- Step 19 integration acceptance: tenant-scoped completeness + actionable field-50 evidence.

do $seed$
declare
  u_owner uuid := 'f1111111-1111-4111-8111-111111111111';
  u_viewer uuid := 'f2222222-2222-4222-8222-222222222222';
  u_other uuid := 'f3333333-3333-4333-8333-333333333333';
  org_a uuid := 'f4444444-4444-4444-8444-444444444444';
  org_b uuid := 'f5555555-5555-4555-8555-555555555555';
  model_a uuid := 'f6666666-6666-4666-8666-666666666666';
  item_a uuid := 'f7777777-7777-4777-8777-777777777777';
  passport_a uuid := 'f8888888-8888-4888-8888-888888888888';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_viewer,u_other
    );
  else
    insert into auth.users(id) values (u_owner),(u_viewer),(u_other);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'Step19 Org A','step19-org-a'),
    (org_b,'Step19 Org B','step19-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values (
    model_a,org_a,'S19-LMT-A','Step19 Maker','light_means_of_transport',
    '{
      "identification":{"manufacturer":{"name":"Step19 Maker"},"category":"light_means_of_transport","model_id":"S19-LMT-A"},
      "point_applicability":{"35":false,"41":false}
    }'::jsonb
  );

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by
  ) values (
    item_a,org_a,model_a,'urn:dpp:step19:lmt:000001','original',
    '{"point_applicability":{"57":false,"58":false,"68":false,"69":false,"70":false,"71":false}}'::jsonb,
    u_owner
  );

  insert into public.dpp_passports(
    id,organization_id,battery_item_id,status,public_payload,private_payload,created_by
  ) values (
    passport_a,org_a,item_a,'draft',
    '{"model":{"identification":{"category":"light_means_of_transport"}},"item":{"unique_identifier":"urn:dpp:step19:lmt:000001"}}'::jsonb,
    '{}'::jsonb,u_owner
  );
end
$seed$;

do $step19$
declare
  org_a uuid := 'f4444444-4444-4444-8444-444444444444';
  org_b uuid := 'f5555555-5555-4555-8555-555555555555';
  passport_a uuid := 'f8888888-8888-4888-8888-888888888888';
  report_before jsonb;
  report_after jsonb;
  receipt jsonb;
  seen boolean;
begin
  perform set_config('request.jwt.claim.sub','f1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);

  report_before:=public.dpp_api_scooter_completeness_by_identifier('urn:dpp:step19:lmt:000001');

  if (report_before->>'required_point_count')::integer<>50 then
    raise exception 'STEP19 required count must be 50 when all conditionals are false';
  end if;
  if (report_before->>'undecided_count')::integer<>0 then
    raise exception 'STEP19 all conditional decisions should be resolved';
  end if;
  if (report_before->>'blocking_count')::integer<>(report_before->>'missing_count')::integer then
    raise exception 'STEP19 blocking count mismatch';
  end if;
  if (report_before->>'workflow_score_percent')::numeric>=100 then
    raise exception 'STEP19 incomplete fixture incorrectly scored 100';
  end if;
  if not ((report_before->'missing_points') @> '[50]'::jsonb) then
    raise exception 'STEP19 field 50 must be reported missing before evidence';
  end if;
  if report_before->>'passport_updated_at' is null then
    raise exception 'STEP19 optimistic activation timestamp missing';
  end if;

  receipt:=public.dpp_api_scooter_authority_evidence_submit(
    passport_a,50,'{"document_ref":"S19-LAB-REPORT-001","sha256":"fixture"}'::jsonb
  );
  if (receipt->>'accepted')::boolean is not true
     or (receipt->>'field_number')::integer<>50
     or receipt ? 'evidence' then
    raise exception 'STEP19 evidence receipt leaks or is malformed: %',receipt;
  end if;

  report_after:=public.dpp_api_scooter_completeness_by_identifier('urn:dpp:step19:lmt:000001');
  if (report_after->'missing_points') @> '[50]'::jsonb then
    raise exception 'STEP19 field 50 remained missing after accepted evidence';
  end if;
  if (report_after->>'missing_count')::integer<>(report_before->>'missing_count')::integer-1 then
    raise exception 'STEP19 evidence did not reduce missing count by exactly one';
  end if;

  perform set_config('request.jwt.claim.sub','f2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  seen:=false;
  begin
    perform public.dpp_api_scooter_authority_evidence_submit(
      passport_a,50,'{"document_ref":"VIEWER-MUST-FAIL"}'::jsonb
    );
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'STEP19 viewer wrote authority evidence'; end if;

  perform set_config('request.jwt.claim.sub','f3333333-3333-4333-8333-333333333333',true);
  perform public.dpp_set_active_organization(org_b);
  seen:=false;
  begin
    perform public.dpp_api_scooter_completeness_by_identifier('urn:dpp:step19:lmt:000001');
  exception when sqlstate 'DP405' then seen:=true;
  end;
  if not seen then raise exception 'STEP19 cross-tenant identifier read was not denied'; end if;

  if has_function_privilege('anon','public.dpp_api_scooter_completeness_by_identifier(text)','EXECUTE')
     or has_function_privilege('anon','public.dpp_api_scooter_authority_evidence_submit(uuid,integer,jsonb)','EXECUTE') then
    raise exception 'STEP19 RPC leaked anon EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_scooter_completeness_by_identifier(text)','EXECUTE')
     or not has_function_privilege('authenticated','public.dpp_api_scooter_authority_evidence_submit(uuid,integer,jsonb)','EXECUTE') then
    raise exception 'STEP19 authenticated RPC grant missing';
  end if;
end
$step19$;

select 'STEP19_COMPLETENESS_WORKFLOW_PASS' as result;
