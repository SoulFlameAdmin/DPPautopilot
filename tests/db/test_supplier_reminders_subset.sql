-- BAT59 supplier reminder authorization/audit subset.
do $seed$
declare
  u_owner uuid := '51000000-0000-4000-8000-000000000001';
  u_viewer uuid := '51000000-0000-4000-8000-000000000002';
  u_outsider uuid := '51000000-0000-4000-8000-000000000003';
  org_a uuid := '52000000-0000-4000-8000-000000000001';
  org_b uuid := '52000000-0000-4000-8000-000000000002';
  supplier_a uuid := '53000000-0000-4000-8000-000000000001';
  model_a uuid := '54000000-0000-4000-8000-000000000001';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_viewer,u_outsider
    );
  else
    insert into auth.users(id) values (u_owner),(u_viewer),(u_outsider);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'BAT59 Org A','bat59-org-a'),
    (org_b,'BAT59 Org B','bat59-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_outsider,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category
  ) values(
    model_a,org_a,'BAT59-MODEL','BAT59 Maker','industrial'
  );

  insert into public.dpp_suppliers(
    id,organization_id,external_ref,legal_name
  ) values(
    supplier_a,org_a,'BAT59-SUP','BAT59 Supplier'
  );

  insert into public.dpp_supplier_data_packages(
    organization_id,supplier_id,subject_kind,subject_ref,model_id,component_ref,
    payload,source_date
  ) values(
    org_a,supplier_a,'component','component:BAT59',model_a,'CELL-59',
    '{"chemistry":"LFP"}'::jsonb,'2026-10-02T00:00:00Z'
  );

  insert into public.dpp_supplier_field_requirements(
    organization_id,supplier_id,subject_kind,subject_ref,field_path
  ) values
    (org_a,supplier_a,'component','component:BAT59','chemistry'),
    (org_a,supplier_a,'component','component:BAT59','country_of_origin');
end
$seed$;

do $bat59$
declare
  u_owner uuid := '51000000-0000-4000-8000-000000000001';
  u_viewer uuid := '51000000-0000-4000-8000-000000000002';
  u_outsider uuid := '51000000-0000-4000-8000-000000000003';
  org_a uuid := '52000000-0000-4000-8000-000000000001';
  org_b uuid := '52000000-0000-4000-8000-000000000002';
  supplier_a uuid := '53000000-0000-4000-8000-000000000001';
  v_result jsonb;
  v_count integer;
  denied boolean := false;
  hidden boolean := false;
  mutation_rejected boolean := false;
begin
  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  perform public.dpp_set_active_organization(org_a);

  v_result:=public.dpp_api_supplier_reminder_create(
    supplier_a,'component','component:BAT59','email'
  );

  if v_result->>'delivery_status' <> 'queued' then
    raise exception 'BAT59 reminder was not queued';
  end if;
  if v_result->'missing_fields' <> '["country_of_origin"]'::jsonb then
    raise exception 'BAT59 reminder fields were not derived from missing-data queue: %',v_result->'missing_fields';
  end if;

  select count(*) into v_count
  from public.dpp_supplier_reminder_events
  where organization_id=org_a and supplier_id=supplier_a;

  if v_count <> 1 then
    raise exception 'BAT59 expected one audit reminder event, got %',v_count;
  end if;

  begin
    update public.dpp_supplier_reminder_events
    set delivery_status='sent'
    where organization_id=org_a and supplier_id=supplier_a;
  exception when sqlstate '55000' then
    mutation_rejected:=true;
  end;
  if not mutation_rejected then
    raise exception 'BAT59 reminder audit event mutation was not rejected';
  end if;

  perform set_config('request.jwt.claim.sub',u_viewer::text,true);
  perform public.dpp_set_active_organization(org_a);
  begin
    perform public.dpp_api_supplier_reminder_create(
      supplier_a,'component','component:BAT59','email'
    );
  exception when sqlstate 'DP104' then
    denied:=true;
  end;
  if not denied then
    raise exception 'BAT59 viewer unexpectedly triggered reminder';
  end if;

  perform set_config('request.jwt.claim.sub',u_outsider::text,true);
  perform public.dpp_set_active_organization(org_b);
  begin
    perform public.dpp_api_supplier_reminder_create(
      supplier_a,'component','component:BAT59','email'
    );
  exception when sqlstate 'DP601' then
    hidden:=true;
  end;
  if not hidden then
    raise exception 'BAT59 cross-tenant supplier was not hidden';
  end if;

  if public.dpp_api_supplier_reminders_list(null) <> '[]'::jsonb then
    raise exception 'BAT59 cross-tenant reminder list leaked another tenant';
  end if;
end
$bat59$;

select 'BAT59_SUPPLIER_REMINDERS_DB_PASS' as result;
