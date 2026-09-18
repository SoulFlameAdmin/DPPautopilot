-- M05 partial precursor: tenant/RBAC row-level policies.
-- Production table grants remain revoked. M05 stays RED until M02/M03 are complete.
-- Policies are prepared and regression-tested under temporary transactional grants only.

create or replace function public.dpp_request_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_sub text;
begin
  v_sub:=nullif(current_setting('request.jwt.claim.sub',true),'');
  if v_sub is null then
    return null;
  end if;
  begin
    return v_sub::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end
$fn$;

create or replace function public.dpp_has_org_role(
  p_organization_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $fn$
  select exists(
    select 1
    from public.dpp_organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=public.dpp_request_user_id()
      and m.role=any(p_roles)
  );
$fn$;

revoke all on function public.dpp_request_user_id() from public,anon;
revoke all on function public.dpp_has_org_role(uuid,text[]) from public,anon;
grant execute on function public.dpp_request_user_id() to authenticated;
grant execute on function public.dpp_has_org_role(uuid,text[]) to authenticated;

-- Organisations: visible to members; mutable by owner/admin.
create policy dpp_organizations_member_select
on public.dpp_organizations for select to authenticated
using (public.dpp_has_org_role(id,array['owner','admin','editor','viewer']));

create policy dpp_organizations_admin_update
on public.dpp_organizations for update to authenticated
using (public.dpp_has_org_role(id,array['owner','admin']))
with check (public.dpp_has_org_role(id,array['owner','admin']));

create policy dpp_organizations_owner_delete
on public.dpp_organizations for delete to authenticated
using (public.dpp_has_org_role(id,array['owner']));

-- Memberships: visible to tenant members; owner/admin can manage.
create policy dpp_members_member_select
on public.dpp_organization_members for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));

create policy dpp_members_admin_insert
on public.dpp_organization_members for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_members_admin_update
on public.dpp_organization_members for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_members_admin_delete
on public.dpp_organization_members for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

-- Tenant data tables: members read; owner/admin/editor write; owner/admin delete.
create policy dpp_models_member_select
on public.dpp_battery_models for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_models_editor_insert
on public.dpp_battery_models for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_models_editor_update
on public.dpp_battery_models for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_models_admin_delete
on public.dpp_battery_models for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_items_member_select
on public.dpp_battery_items for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_items_editor_insert
on public.dpp_battery_items for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_items_editor_update
on public.dpp_battery_items for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_items_admin_delete
on public.dpp_battery_items for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_passports_member_select
on public.dpp_passports for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_passports_editor_insert
on public.dpp_passports for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_passports_editor_update
on public.dpp_passports for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_passports_admin_delete
on public.dpp_passports for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_import_mappings_member_select
on public.dpp_import_mappings for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_import_mappings_editor_insert
on public.dpp_import_mappings for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_import_mappings_editor_update
on public.dpp_import_mappings for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_import_mappings_admin_delete
on public.dpp_import_mappings for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_import_runs_member_select
on public.dpp_import_runs for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_import_runs_editor_insert
on public.dpp_import_runs for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_import_runs_editor_update
on public.dpp_import_runs for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_import_runs_admin_delete
on public.dpp_import_runs for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

create policy dpp_registry_member_select
on public.dpp_registry_submissions for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));
create policy dpp_registry_editor_insert
on public.dpp_registry_submissions for insert to authenticated
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_registry_editor_update
on public.dpp_registry_submissions for update to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor']))
with check (public.dpp_has_org_role(organization_id,array['owner','admin','editor']));
create policy dpp_registry_admin_delete
on public.dpp_registry_submissions for delete to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));

-- History/audit are read-only through policies; writes remain trigger/service controlled.
create policy dpp_passport_versions_member_select
on public.dpp_passport_versions for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin','editor','viewer']));

create policy dpp_audit_log_admin_select
on public.dpp_audit_log for select to authenticated
using (public.dpp_has_org_role(organization_id,array['owner','admin']));
