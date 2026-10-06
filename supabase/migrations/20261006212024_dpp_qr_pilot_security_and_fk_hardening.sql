-- QR pilot hardening: remove anonymous access from legacy admin RPCs
-- and add covering indexes for DPP foreign keys when those optional surfaces exist.

do $hardening$
begin
  if to_regprocedure('public.sf_admin_bind_dpp_nfc_carrier(uuid,text,text)') is not null then
    execute 'revoke execute on function public.sf_admin_bind_dpp_nfc_carrier(uuid,text,text) from public, anon';
    execute 'grant execute on function public.sf_admin_bind_dpp_nfc_carrier(uuid,text,text) to authenticated';
    if exists (select 1 from pg_roles where rolname='service_role') then
      execute 'grant execute on function public.sf_admin_bind_dpp_nfc_carrier(uuid,text,text) to service_role';
    end if;
  end if;

  if to_regprocedure('public.sf_admin_list_dpp_battery_models()') is not null then
    execute 'revoke execute on function public.sf_admin_list_dpp_battery_models() from public, anon';
    execute 'grant execute on function public.sf_admin_list_dpp_battery_models() to authenticated';
    if exists (select 1 from pg_roles where rolname='service_role') then
      execute 'grant execute on function public.sf_admin_list_dpp_battery_models() to service_role';
    end if;
  end if;

  if to_regprocedure('public.sf_admin_provision_dpp_battery(uuid,text,text)') is not null then
    execute 'revoke execute on function public.sf_admin_provision_dpp_battery(uuid,text,text) from public, anon';
    execute 'grant execute on function public.sf_admin_provision_dpp_battery(uuid,text,text) to authenticated';
    if exists (select 1 from pg_roles where rolname='service_role') then
      execute 'grant execute on function public.sf_admin_provision_dpp_battery(uuid,text,text) to service_role';
    end if;
  end if;
end
$hardening$;

do $indexes$
declare
  v record;
begin
  for v in
    select * from (values
      ('dpp_authority_evidence_created_by_fk_idx','public.dpp_authority_evidence','created_by'),
      ('dpp_authority_evidence_model_id_fk_idx','public.dpp_authority_evidence','model_id'),
      ('dpp_field_events_recorded_by_fk_idx','public.dpp_field_events','recorded_by'),
      ('dpp_field_events_supersedes_id_fk_idx','public.dpp_field_events','supersedes_id'),
      ('dpp_nfc_challenges_org_battery_fk_idx','public.dpp_nfc_challenges','organization_id,battery_item_id'),
      ('dpp_nfc_challenges_org_identity_fk_idx','public.dpp_nfc_challenges','organization_id,nfc_identity_id'),
      ('dpp_nfc_identities_org_replaces_fk_idx','public.dpp_nfc_identities','organization_id,replaces_identity_id'),
      ('dpp_nfc_provisioning_receipts_org_fk_idx','public.dpp_nfc_provisioning_receipts','organization_id'),
      ('dpp_nfc_provisioning_receipts_org_battery_fk_idx','public.dpp_nfc_provisioning_receipts','organization_id,battery_item_id'),
      ('dpp_nfc_provisioning_receipts_org_identity_fk_idx','public.dpp_nfc_provisioning_receipts','organization_id,nfc_identity_id'),
      ('dpp_nfc_verification_events_org_battery_fk_idx','public.dpp_nfc_verification_events','organization_id,battery_item_id'),
      ('dpp_nfc_verification_events_org_challenge_fk_idx','public.dpp_nfc_verification_events','organization_id,challenge_id'),
      ('dpp_partner_access_lead_id_fk_idx','public.dpp_partner_access','lead_id'),
      ('dpp_passport_authority_payloads_updated_by_fk_idx','public.dpp_passport_authority_payloads','updated_by'),
      ('dpp_passport_lifecycle_changed_by_fk_idx','public.dpp_passport_lifecycle','changed_by'),
      ('dpp_passport_lifecycle_org_item_fk_idx','public.dpp_passport_lifecycle','organization_id,replacement_item_id'),
      ('dpp_physical_carriers_bound_by_fk_idx','public.dpp_physical_carriers','bound_by'),
      ('dpp_provision_batch_items_passport_id_fk_idx','public.dpp_provision_batch_items','passport_id'),
      ('dpp_provision_batches_created_by_fk_idx','public.dpp_provision_batches','created_by'),
      ('dpp_provision_batches_model_id_fk_idx','public.dpp_provision_batches','model_id'),
      ('dpp_supplier_data_packages_created_by_fk_idx','public.dpp_supplier_data_packages','created_by'),
      ('dpp_supplier_field_requirements_created_by_fk_idx','public.dpp_supplier_field_requirements','created_by'),
      ('dpp_supplier_invitations_accepted_by_fk_idx','public.dpp_supplier_invitations','accepted_by'),
      ('dpp_supplier_invitations_created_by_fk_idx','public.dpp_supplier_invitations','created_by'),
      ('dpp_supplier_package_verification_events_recorded_by_fk_idx','public.dpp_supplier_package_verification_events','recorded_by'),
      ('dpp_supplier_portal_members_created_by_fk_idx','public.dpp_supplier_portal_members','created_by'),
      ('dpp_supplier_reminder_events_created_by_fk_idx','public.dpp_supplier_reminder_events','created_by'),
      ('dpp_world_companies_created_by_fk_idx','public.dpp_world_companies','created_by')
    ) as x(index_name, table_name, columns_sql)
  loop
    if to_regclass(v.table_name) is not null then
      execute format('create index if not exists %I on %s (%s)',v.index_name,v.table_name,v.columns_sql);
    end if;
  end loop;
end
$indexes$;
