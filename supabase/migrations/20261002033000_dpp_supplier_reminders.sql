-- BAT59 Supplier reminder workflow.
-- Reminder triggers are derived from the server-side missing-data queue and are
-- append-only/auditable. Actual provider delivery can be attached later without
-- changing the audit contract.

create table public.dpp_supplier_reminder_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  supplier_id uuid not null,
  subject_kind text not null check (subject_kind in ('model','item','component','material')),
  subject_ref text not null check (length(btrim(subject_ref)) between 1 and 300),
  missing_fields jsonb not null check (
    jsonb_typeof(missing_fields)='array'
    and jsonb_array_length(missing_fields) between 1 and 500
  ),
  channel text not null check (channel in ('email','portal','manual')),
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued','sent','failed','cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint dpp_supplier_reminders_org_supplier_fk
    foreign key (organization_id,supplier_id)
    references public.dpp_suppliers(organization_id,id)
    on delete restrict
);

create index dpp_supplier_reminders_org_supplier_time_idx
  on public.dpp_supplier_reminder_events(
    organization_id,supplier_id,created_at desc,id desc
  );

alter table public.dpp_supplier_reminder_events enable row level security;
revoke all on table public.dpp_supplier_reminder_events from anon,authenticated;

create or replace function public.dpp_reject_supplier_reminder_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $fn$
begin
  raise exception 'dpp_supplier_reminder_events is append-only'
    using errcode='55000';
end;
$fn$;

revoke all on function public.dpp_reject_supplier_reminder_mutation() from public,anon,authenticated;

create trigger dpp_supplier_reminder_events_append_only
before update or delete on public.dpp_supplier_reminder_events
for each row execute function public.dpp_reject_supplier_reminder_mutation();

create or replace function public.dpp_api_supplier_reminder_create(
  p_supplier_id uuid,
  p_subject_kind text,
  p_subject_ref text,
  p_channel text default 'email'
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_supplier_exists boolean;
  v_missing jsonb;
  v_row public.dpp_supplier_reminder_events%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_supplier_id is null then
    raise exception 'supplier id is required' using errcode='DP601';
  end if;
  if p_subject_kind is null or p_subject_kind not in ('model','item','component','material') then
    raise exception 'invalid subject kind' using errcode='DP602';
  end if;
  if p_subject_ref is null or length(btrim(p_subject_ref)) not between 1 and 300 then
    raise exception 'invalid subject ref' using errcode='DP602';
  end if;
  if p_channel is null or p_channel not in ('email','portal','manual') then
    raise exception 'invalid reminder channel' using errcode='DP602';
  end if;

  select exists(
    select 1
    from public.dpp_suppliers s
    where s.organization_id=v_org
      and s.id=p_supplier_id
  ) into v_supplier_exists;

  if not v_supplier_exists then
    raise exception 'supplier not found in active organization' using errcode='DP601';
  end if;

  select jsonb_agg(q.field_path order by q.field_path)
  into v_missing
  from public.dpp_supplier_missing_data_queue q
  where q.organization_id=v_org
    and q.supplier_id=p_supplier_id
    and q.subject_kind=p_subject_kind
    and q.subject_ref=btrim(p_subject_ref);

  if v_missing is null or jsonb_array_length(v_missing)=0 then
    raise exception 'no current missing supplier fields' using errcode='DP603';
  end if;

  insert into public.dpp_supplier_reminder_events(
    organization_id,supplier_id,subject_kind,subject_ref,missing_fields,
    channel,delivery_status,created_by
  ) values(
    v_org,p_supplier_id,p_subject_kind,btrim(p_subject_ref),v_missing,
    p_channel,'queued',v_user
  )
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'supplier_id',v_row.supplier_id,
    'subject_kind',v_row.subject_kind,
    'subject_ref',v_row.subject_ref,
    'missing_fields',v_row.missing_fields,
    'channel',v_row.channel,
    'delivery_status',v_row.delivery_status,
    'created_at',v_row.created_at
  );
end
$fn$;

create or replace function public.dpp_api_supplier_reminders_list(
  p_supplier_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_result jsonb;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',r.id,
        'supplier_id',r.supplier_id,
        'subject_kind',r.subject_kind,
        'subject_ref',r.subject_ref,
        'missing_fields',r.missing_fields,
        'channel',r.channel,
        'delivery_status',r.delivery_status,
        'created_at',r.created_at
      )
      order by r.created_at desc,r.id desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.dpp_supplier_reminder_events r
  where r.organization_id=v_org
    and (p_supplier_id is null or r.supplier_id=p_supplier_id);

  return v_result;
end
$fn$;

revoke all on function public.dpp_api_supplier_reminder_create(uuid,text,text,text) from public,anon;
revoke all on function public.dpp_api_supplier_reminders_list(uuid) from public,anon;
grant execute on function public.dpp_api_supplier_reminder_create(uuid,text,text,text) to authenticated;
grant execute on function public.dpp_api_supplier_reminders_list(uuid) to authenticated;

comment on function public.dpp_api_supplier_reminder_create(uuid,text,text,text) is
  'BAT59: owner/admin/editor may queue an auditable reminder only for current missing fields in the active tenant.';
comment on function public.dpp_api_supplier_reminders_list(uuid) is
  'BAT59: tenant-scoped supplier reminder audit history.';
