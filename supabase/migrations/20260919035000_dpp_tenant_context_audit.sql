-- M12 hardening: audit explicit active-tenant context changes.
-- Tenant switches affect authorization scope and therefore require actor/before/after history.

create or replace function public.dpp_capture_tenant_context_audit()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_before jsonb;
  v_after jsonb;
  v_subject jsonb;
  v_org uuid;
  v_user uuid;
  v_actor uuid;
begin
  if tg_op='INSERT' then
    v_before:=null;
    v_after:=to_jsonb(new);
    v_subject:=v_after;
  elsif tg_op='UPDATE' then
    v_before:=to_jsonb(old);
    v_after:=to_jsonb(new);
    v_subject:=v_after;
  elsif tg_op='DELETE' then
    v_before:=to_jsonb(old);
    v_after:=null;
    v_subject:=v_before;
  else
    raise exception 'unsupported tenant-context audit operation %',tg_op
      using errcode='0A000';
  end if;

  v_org:=nullif(v_subject->>'active_organization_id','')::uuid;
  v_user:=nullif(v_subject->>'user_id','')::uuid;
  v_actor:=public.dpp_request_user_id();

  insert into public.dpp_audit_log(
    organization_id,actor_id,action,target_table,target_id,before_data,after_data
  ) values(
    v_org,v_actor,tg_op,'dpp_user_tenant_context',v_user,v_before,v_after
  );

  return coalesce(new,old);
end
$fn$;

drop trigger if exists dpp_audit_user_tenant_context on public.dpp_user_tenant_context;
create trigger dpp_audit_user_tenant_context
after insert or update or delete on public.dpp_user_tenant_context
for each row execute function public.dpp_capture_tenant_context_audit();

revoke all on function public.dpp_capture_tenant_context_audit() from public,anon,authenticated;

comment on function public.dpp_capture_tenant_context_audit() is
  'M12 append-only actor/before/after audit for authorization-scope active tenant changes.';
