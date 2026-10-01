-- BAT58 Supplier missing-data queue.
-- Requirements are tenant/supplier/product scoped. Missing fields are derived
-- from the latest supplier package without mutating supplier evidence.

create table public.dpp_supplier_field_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dpp_organizations(id) on delete cascade,
  supplier_id uuid not null,
  subject_kind text not null check (subject_kind in ('model','item','component','material')),
  subject_ref text not null check (length(btrim(subject_ref)) between 1 and 300),
  field_path text not null check (length(btrim(field_path)) between 1 and 300),
  due_at timestamptz null,
  active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, supplier_id, subject_kind, subject_ref, field_path),
  constraint dpp_supplier_requirements_org_supplier_fk
    foreign key (organization_id, supplier_id)
    references public.dpp_suppliers(organization_id, id)
    on delete cascade
);

create index dpp_supplier_requirements_queue_idx
  on public.dpp_supplier_field_requirements(
    organization_id, supplier_id, active, due_at, subject_kind, subject_ref
  );

alter table public.dpp_supplier_field_requirements enable row level security;
revoke all on table public.dpp_supplier_field_requirements from anon, authenticated;

create view public.dpp_supplier_missing_data_queue as
select
  r.organization_id,
  r.supplier_id,
  s.legal_name as supplier_name,
  r.subject_kind,
  r.subject_ref,
  r.field_path,
  r.due_at,
  p.id as latest_package_id,
  case
    when p.id is null then 'no_package'
    else 'field_missing'
  end as missing_reason
from public.dpp_supplier_field_requirements r
join public.dpp_suppliers s
  on s.organization_id=r.organization_id
 and s.id=r.supplier_id
left join lateral (
  select sp.id, sp.payload
  from public.dpp_supplier_data_packages sp
  where sp.organization_id=r.organization_id
    and sp.supplier_id=r.supplier_id
    and sp.subject_kind=r.subject_kind
    and sp.subject_ref=r.subject_ref
  order by sp.created_at desc, sp.id desc
  limit 1
) p on true
where r.active
  and (
    p.id is null
    or p.payload #> string_to_array(r.field_path,'.') is null
    or p.payload #> string_to_array(r.field_path,'.') = 'null'::jsonb
    or p.payload #>> string_to_array(r.field_path,'.') = ''
  );

create view public.dpp_supplier_missing_data_summary as
select
  organization_id,
  supplier_id,
  supplier_name,
  subject_kind,
  subject_ref,
  count(*)::integer as missing_count,
  jsonb_agg(field_path order by field_path) as missing_fields,
  min(due_at) as earliest_due_at
from public.dpp_supplier_missing_data_queue
group by organization_id, supplier_id, supplier_name, subject_kind, subject_ref;

revoke all on public.dpp_supplier_missing_data_queue from public, anon, authenticated;
revoke all on public.dpp_supplier_missing_data_summary from public, anon, authenticated;

comment on view public.dpp_supplier_missing_data_summary is
  'BAT58 supplier/product grouped missing-data queue derived from latest supplier package payloads.';
