-- M12 partial precursor: immutable critical audit log for existing DPP records.
-- M12 remains RED until M03 RBAC exists and actor/authorization behavior is tested end-to-end.
-- Audit rows intentionally do not FK to tenants/users so history can survive future retention/deletion workflows.

create table public.dpp_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid null,
  actor_id uuid null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  target_table text not null check (length(btrim(target_table)) between 1 and 120),
  target_id uuid null,
  before_data jsonb null check (before_data is null or jsonb_typeof(before_data)='object'),
  after_data jsonb null check (after_data is null or jsonb_typeof(after_data)='object'),
  occurred_at timestamptz not null default now()
);

create index dpp_audit_log_org_time_idx
  on public.dpp_audit_log(organization_id,occurred_at desc);

create index dpp_audit_log_target_idx
  on public.dpp_audit_log(target_table,target_id,occurred_at desc);

alter table public.dpp_audit_log enable row level security;
revoke all on table public.dpp_audit_log from anon,authenticated;

create or replace function public.dpp_reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
begin
  raise exception 'dpp_audit_log is append-only'
    using errcode='55000';
end
$fn$;

create trigger dpp_audit_log_append_only
before update or delete on public.dpp_audit_log
for each row execute function public.dpp_reject_audit_mutation();

create or replace function public.dpp_capture_audit_event()
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
  v_target uuid;
  v_actor uuid;
  v_claim text;
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
    raise exception 'unsupported audit operation %',tg_op
      using errcode='0A000';
  end if;

  begin
    if tg_table_name='dpp_organizations' then
      v_org:=nullif(v_subject->>'id','')::uuid;
    else
      v_org:=nullif(v_subject->>'organization_id','')::uuid;
    end if;
  exception when invalid_text_representation then
    v_org:=null;
  end;

  begin
    v_target:=nullif(coalesce(v_subject->>'id',v_subject->>'user_id'),'')::uuid;
  exception when invalid_text_representation then
    v_target:=null;
  end;

  v_claim:=nullif(current_setting('request.jwt.claim.sub',true),'');
  begin
    if v_claim is not null then
      v_actor:=v_claim::uuid;
    else
      v_actor:=nullif(v_subject->>'created_by','')::uuid;
    end if;
  exception when invalid_text_representation then
    v_actor:=null;
  end;

  insert into public.dpp_audit_log(
    organization_id,actor_id,action,target_table,target_id,before_data,after_data
  ) values(
    v_org,v_actor,tg_op,tg_table_name,v_target,v_before,v_after
  );

  return coalesce(new,old);
end
$fn$;

create trigger dpp_audit_organizations
after insert or update or delete on public.dpp_organizations
for each row execute function public.dpp_capture_audit_event();

create trigger dpp_audit_organization_members
after insert or update or delete on public.dpp_organization_members
for each row execute function public.dpp_capture_audit_event();

create trigger dpp_audit_battery_models
after insert or update or delete on public.dpp_battery_models
for each row execute function public.dpp_capture_audit_event();

create trigger dpp_audit_battery_items
after insert or update or delete on public.dpp_battery_items
for each row execute function public.dpp_capture_audit_event();

create trigger dpp_audit_passports
after insert or update or delete on public.dpp_passports
for each row execute function public.dpp_capture_audit_event();

create trigger dpp_audit_import_mappings
after insert or update or delete on public.dpp_import_mappings
for each row execute function public.dpp_capture_audit_event();

create trigger dpp_audit_import_runs
after insert or update or delete on public.dpp_import_runs
for each row execute function public.dpp_capture_audit_event();

create trigger dpp_audit_registry_submissions
after insert or update or delete on public.dpp_registry_submissions
for each row execute function public.dpp_capture_audit_event();

revoke all on function public.dpp_reject_audit_mutation() from public,anon,authenticated;
revoke all on function public.dpp_capture_audit_event() from public,anon,authenticated;
