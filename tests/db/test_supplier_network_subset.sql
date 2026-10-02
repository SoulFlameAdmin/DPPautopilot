-- BAT51/BAT53/BAT55 supplier network database acceptance subset.
do $bat_supplier$
declare
  v_org uuid := '41000000-0000-4000-8000-000000000001';
  v_other_org uuid := '41000000-0000-4000-8000-000000000002';
  v_supplier uuid := '42000000-0000-4000-8000-000000000001';
  v_first uuid := '43000000-0000-4000-8000-000000000001';
  v_second uuid := '43000000-0000-4000-8000-000000000002';
  v_model uuid := '44000000-0000-4000-8000-000000000001';
  v_count integer;
  mutation_rejected boolean := false;
  verification_mutation_rejected boolean := false;
  ambiguous_scope_rejected boolean := false;
  cross_tenant_rejected boolean := false;
  signature_mutation_rejected boolean := false;
  portal_cross_tenant_rejected boolean := false;
  v_user uuid := '45000000-0000-4000-8000-000000000001';
  v_missing integer;
begin
  insert into auth.users(id) values(v_user);

  insert into public.dpp_organizations(id,name,slug) values
    (v_org,'BAT Supplier Test','bat-supplier-test'),
    (v_other_org,'BAT Supplier Other','bat-supplier-other');

  insert into public.dpp_battery_models(id,organization_id,model_identifier,manufacturer_name,category)
  values(v_model,v_org,'MODEL-SUP-1','Battery Trust Test','industrial');

  insert into public.dpp_suppliers(id,organization_id,external_ref,legal_name)
  values(v_supplier,v_org,'SUP-001','Example Cells GmbH');

  insert into public.dpp_supplier_data_packages(
    id,organization_id,supplier_id,subject_kind,subject_ref,model_id,component_ref,payload,
    source_date,verification_status,created_at
  ) values(
    v_first,v_org,v_supplier,'component','cell:NMC-21700',v_model,'CELL-01',
    '{"chemistry":"NMC","mass_g":68}'::jsonb,
    '2026-10-01T10:00:00Z','validated','2026-10-02T01:00:00Z'
  );

  insert into public.dpp_supplier_data_packages(
    id,organization_id,supplier_id,subject_kind,subject_ref,model_id,component_ref,payload,
    source_date,verification_status,supersedes_id,created_at
  ) values(
    v_second,v_org,v_supplier,'component','cell:NMC-21700',v_model,'CELL-01',
    '{"chemistry":"NMC","mass_g":67.8}'::jsonb,
    '2026-10-02T10:00:00Z','verified',v_first,'2026-10-02T11:00:00Z'
  );

  select count(*) into v_count
  from public.dpp_supplier_data_packages
  where organization_id=v_org and supplier_id=v_supplier and subject_ref='cell:NMC-21700';

  if v_count <> 2 then
    raise exception 'supplier package history expected 2 rows, got %', v_count;
  end if;

  begin
    update public.dpp_supplier_data_packages
    set verification_status='rejected'
    where id=v_first;
  exception when sqlstate '55000' then
    mutation_rejected := true;
  end;

  if not mutation_rejected then
    raise exception 'supplier package append-only update was not rejected';
  end if;


  insert into public.dpp_supplier_package_verification_events(
    organization_id,package_id,status,evidence_ref,note,recorded_at
  ) values(
    v_org,v_second,'validated','validation:ruleset:v1','Schema and unit checks passed','2026-10-02T11:05:00Z'
  );

  insert into public.dpp_supplier_package_verification_events(
    organization_id,package_id,status,evidence_ref,note,recorded_at
  ) values(
    v_org,v_second,'verified','supplier-evidence:sha256:example','Reviewed supplier evidence','2026-10-02T11:10:00Z'
  );

  select count(*) into v_count
  from public.dpp_supplier_package_verification_events
  where organization_id=v_org and package_id=v_second;

  if v_count <> 2 then
    raise exception 'supplier verification history expected 2 rows, got %', v_count;
  end if;

  begin
    update public.dpp_supplier_package_verification_events
    set status='rejected'
    where organization_id=v_org and package_id=v_second;
  exception when sqlstate '55000' then
    verification_mutation_rejected := true;
  end;

  if not verification_mutation_rejected then
    raise exception 'supplier verification event update was not rejected';
  end if;

  begin
    insert into public.dpp_supplier_data_packages(
      organization_id,supplier_id,subject_kind,subject_ref,payload,source_date
    ) values(
      v_org,v_supplier,'component','component:ambiguous','{}'::jsonb,'2026-10-02T11:30:00Z'
    );
  exception when check_violation then
    ambiguous_scope_rejected := true;
  end;

  if not ambiguous_scope_rejected then
    raise exception 'ambiguous supplier package scope was not rejected';
  end if;



  insert into public.dpp_supplier_invitations(
    organization_id,supplier_id,invitee_email,requested_role,token_sha256,
    expires_at,created_by
  ) values(
    v_org,v_supplier,'supplier@example.com','supplier_editor',
    repeat('a',64),'2026-10-09T00:00:00Z',v_user
  );

  begin
    insert into public.dpp_supplier_portal_members(
      organization_id,supplier_id,user_id,role,created_by
    ) values(
      v_other_org,v_supplier,v_user,'supplier_viewer',v_user
    );
  exception when foreign_key_violation then
    portal_cross_tenant_rejected := true;
  end;

  if not portal_cross_tenant_rejected then
    raise exception 'cross-tenant supplier portal membership was not rejected';
  end if;

  insert into public.dpp_supplier_package_signatures(
    organization_id,package_id,scheme,key_ref,algorithm,payload_sha256,
    signature_base64,signed_at
  ) values(
    v_org,v_second,'jws','supplier-key:2026-01','ES256',
    repeat('b',64),'ZXhhbXBsZS1zaWduYXR1cmU=','2026-10-02T11:15:00Z'
  );

  begin
    update public.dpp_supplier_package_signatures
    set algorithm='RS256'
    where organization_id=v_org and package_id=v_second;
  exception when sqlstate '55000' then
    signature_mutation_rejected := true;
  end;

  if not signature_mutation_rejected then
    raise exception 'supplier signature envelope mutation was not rejected';
  end if;

  insert into public.dpp_supplier_field_requirements(
    organization_id,supplier_id,subject_kind,subject_ref,field_path,due_at
  ) values
    (v_org,v_supplier,'component','cell:NMC-21700','chemistry','2026-10-10T00:00:00Z'),
    (v_org,v_supplier,'component','cell:NMC-21700','country_of_origin','2026-10-09T00:00:00Z');

  select missing_count into v_missing
  from public.dpp_supplier_missing_data_summary
  where organization_id=v_org
    and supplier_id=v_supplier
    and subject_kind='component'
    and subject_ref='cell:NMC-21700';

  if v_missing <> 1 then
    raise exception 'supplier missing-data queue expected 1 missing field, got %', v_missing;
  end if;

  if exists (
    select 1
    from public.dpp_supplier_missing_data_queue
    where organization_id=v_org
      and supplier_id=v_supplier
      and field_path='chemistry'
  ) then
    raise exception 'supplier missing-data queue incorrectly flagged present chemistry';
  end if;

  begin
    insert into public.dpp_supplier_data_packages(
      organization_id,supplier_id,subject_kind,subject_ref,model_id,component_ref,payload,source_date
    ) values(
      v_other_org,v_supplier,'component','cell:cross-tenant',v_model,'CELL-X','{}'::jsonb,'2026-10-02T12:00:00Z'
    );
  exception when foreign_key_violation then
    cross_tenant_rejected := true;
  end;

  if not cross_tenant_rejected then
    raise exception 'cross-tenant supplier binding was not rejected';
  end if;
end
$bat_supplier$;

select 'BAT_SUPPLIER_NETWORK_DB_PASS' as result;
