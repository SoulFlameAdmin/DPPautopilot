-- BAT51/BAT53/BAT55 supplier network database acceptance subset.
do $bat_supplier$
declare
  v_org uuid := '41000000-0000-4000-8000-000000000001';
  v_other_org uuid := '41000000-0000-4000-8000-000000000002';
  v_supplier uuid := '42000000-0000-4000-8000-000000000001';
  v_first uuid := '43000000-0000-4000-8000-000000000001';
  v_second uuid := '43000000-0000-4000-8000-000000000002';
  v_count integer;
  mutation_rejected boolean := false;
  cross_tenant_rejected boolean := false;
begin
  insert into public.dpp_organizations(id,name,slug) values
    (v_org,'BAT Supplier Test','bat-supplier-test'),
    (v_other_org,'BAT Supplier Other','bat-supplier-other');

  insert into public.dpp_suppliers(id,organization_id,external_ref,legal_name)
  values(v_supplier,v_org,'SUP-001','Example Cells GmbH');

  insert into public.dpp_supplier_data_packages(
    id,organization_id,supplier_id,subject_kind,subject_ref,payload,
    source_date,verification_status,created_at
  ) values(
    v_first,v_org,v_supplier,'component','cell:NMC-21700',
    '{"chemistry":"NMC","mass_g":68}'::jsonb,
    '2026-10-01T10:00:00Z','validated','2026-10-02T01:00:00Z'
  );

  insert into public.dpp_supplier_data_packages(
    id,organization_id,supplier_id,subject_kind,subject_ref,payload,
    source_date,verification_status,supersedes_id,created_at
  ) values(
    v_second,v_org,v_supplier,'component','cell:NMC-21700',
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

  begin
    insert into public.dpp_supplier_data_packages(
      organization_id,supplier_id,subject_kind,subject_ref,payload,source_date
    ) values(
      v_other_org,v_supplier,'component','cell:cross-tenant','{}'::jsonb,'2026-10-02T12:00:00Z'
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
