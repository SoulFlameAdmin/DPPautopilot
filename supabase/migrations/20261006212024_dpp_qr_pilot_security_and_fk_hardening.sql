-- QR pilot hardening: remove anonymous access from legacy admin RPCs
-- and add covering indexes for all currently unindexed DPP foreign keys.

revoke execute on function public.sf_admin_bind_dpp_nfc_carrier(uuid,text,text) from public, anon;
revoke execute on function public.sf_admin_list_dpp_battery_models() from public, anon;
revoke execute on function public.sf_admin_provision_dpp_battery(uuid,text,text) from public, anon;

grant execute on function public.sf_admin_bind_dpp_nfc_carrier(uuid,text,text) to authenticated;
grant execute on function public.sf_admin_list_dpp_battery_models() to authenticated;
grant execute on function public.sf_admin_provision_dpp_battery(uuid,text,text) to authenticated;

do $grant$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.sf_admin_bind_dpp_nfc_carrier(uuid,text,text) to service_role';
    execute 'grant execute on function public.sf_admin_list_dpp_battery_models() to service_role';
    execute 'grant execute on function public.sf_admin_provision_dpp_battery(uuid,text,text) to service_role';
  end if;
end
$grant$;

create index if not exists dpp_authority_evidence_created_by_fk_idx on public.dpp_authority_evidence(created_by);
create index if not exists dpp_authority_evidence_model_id_fk_idx on public.dpp_authority_evidence(model_id);
create index if not exists dpp_field_events_recorded_by_fk_idx on public.dpp_field_events(recorded_by);
create index if not exists dpp_field_events_supersedes_id_fk_idx on public.dpp_field_events(supersedes_id);
create index if not exists dpp_nfc_challenges_org_battery_fk_idx on public.dpp_nfc_challenges(organization_id,battery_item_id);
create index if not exists dpp_nfc_challenges_org_identity_fk_idx on public.dpp_nfc_challenges(organization_id,nfc_identity_id);
create index if not exists dpp_nfc_identities_org_replaces_fk_idx on public.dpp_nfc_identities(organization_id,replaces_identity_id);
create index if not exists dpp_nfc_provisioning_receipts_org_fk_idx on public.dpp_nfc_provisioning_receipts(organization_id);
create index if not exists dpp_nfc_provisioning_receipts_org_battery_fk_idx on public.dpp_nfc_provisioning_receipts(organization_id,battery_item_id);
create index if not exists dpp_nfc_provisioning_receipts_org_identity_fk_idx on public.dpp_nfc_provisioning_receipts(organization_id,nfc_identity_id);
create index if not exists dpp_nfc_verification_events_org_battery_fk_idx on public.dpp_nfc_verification_events(organization_id,battery_item_id);
create index if not exists dpp_nfc_verification_events_org_challenge_fk_idx on public.dpp_nfc_verification_events(organization_id,challenge_id);
create index if not exists dpp_partner_access_lead_id_fk_idx on public.dpp_partner_access(lead_id);
create index if not exists dpp_passport_authority_payloads_updated_by_fk_idx on public.dpp_passport_authority_payloads(updated_by);
create index if not exists dpp_passport_lifecycle_changed_by_fk_idx on public.dpp_passport_lifecycle(changed_by);
create index if not exists dpp_passport_lifecycle_org_item_fk_idx on public.dpp_passport_lifecycle(organization_id,replacement_item_id);
create index if not exists dpp_physical_carriers_bound_by_fk_idx on public.dpp_physical_carriers(bound_by);
create index if not exists dpp_provision_batch_items_passport_id_fk_idx on public.dpp_provision_batch_items(passport_id);
create index if not exists dpp_provision_batches_created_by_fk_idx on public.dpp_provision_batches(created_by);
create index if not exists dpp_provision_batches_model_id_fk_idx on public.dpp_provision_batches(model_id);
create index if not exists dpp_supplier_data_packages_created_by_fk_idx on public.dpp_supplier_data_packages(created_by);
create index if not exists dpp_supplier_field_requirements_created_by_fk_idx on public.dpp_supplier_field_requirements(created_by);
create index if not exists dpp_supplier_invitations_accepted_by_fk_idx on public.dpp_supplier_invitations(accepted_by);
create index if not exists dpp_supplier_invitations_created_by_fk_idx on public.dpp_supplier_invitations(created_by);
create index if not exists dpp_supplier_package_verification_events_recorded_by_fk_idx on public.dpp_supplier_package_verification_events(recorded_by);
create index if not exists dpp_supplier_portal_members_created_by_fk_idx on public.dpp_supplier_portal_members(created_by);
create index if not exists dpp_supplier_reminder_events_created_by_fk_idx on public.dpp_supplier_reminder_events(created_by);
create index if not exists dpp_world_companies_created_by_fk_idx on public.dpp_world_companies(created_by);
