-- BAT51/BAT53/BAT54/BAT57/BAT60 manufacturer Supplier Network API.
-- All manufacturer-side supplier operations derive tenant from authenticated active context.

create or replace function public.dpp_api_suppliers_list()
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
        'id',s.id,
        'external_ref',s.external_ref,
        'legal_name',s.legal_name,
        'status',s.status,
        'package_count',coalesce(pc.package_count,0),
        'missing_count',coalesce(mc.missing_count,0),
        'last_package_at',pc.last_package_at,
        'created_at',s.created_at,
        'updated_at',s.updated_at
      )
      order by s.legal_name,s.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.dpp_suppliers s
  left join lateral (
    select count(*)::integer as package_count,max(p.created_at) as last_package_at
    from public.dpp_supplier_data_packages p
    where p.organization_id=s.organization_id
      and p.supplier_id=s.id
  ) pc on true
  left join lateral (
    select count(*)::integer as missing_count
    from public.dpp_supplier_missing_data_queue q
    where q.organization_id=s.organization_id
      and q.supplier_id=s.id
  ) mc on true
  where s.organization_id=v_org;

  return v_result;
end
$fn$;

create or replace function public.dpp_api_supplier_create(
  p_external_ref text,
  p_legal_name text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_row public.dpp_suppliers%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_external_ref is null or length(btrim(p_external_ref)) not between 1 and 200 then
    raise exception 'invalid supplier external ref' using errcode='DP602';
  end if;
  if p_legal_name is null or length(btrim(p_legal_name)) not between 1 and 250 then
    raise exception 'invalid supplier legal name' using errcode='DP602';
  end if;

  insert into public.dpp_suppliers(organization_id,external_ref,legal_name)
  values(v_org,btrim(p_external_ref),btrim(p_legal_name))
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'external_ref',v_row.external_ref,
    'legal_name',v_row.legal_name,
    'status',v_row.status,
    'created_at',v_row.created_at,
    'updated_at',v_row.updated_at
  );
end
$fn$;

create or replace function public.dpp_api_supplier_package_create(
  p_supplier_id uuid,
  p_subject_kind text,
  p_subject_ref text,
  p_model_id uuid default null,
  p_item_id uuid default null,
  p_component_ref text default null,
  p_material_ref text default null,
  p_payload jsonb default '{}'::jsonb,
  p_source_date timestamptz default now(),
  p_supersedes_id uuid default null
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
  v_old public.dpp_supplier_data_packages%rowtype;
  v_row public.dpp_supplier_data_packages%rowtype;
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
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'payload must be an object' using errcode='DP602';
  end if;
  if p_source_date is null then
    raise exception 'source date is required' using errcode='DP602';
  end if;

  select exists(
    select 1 from public.dpp_suppliers s
    where s.organization_id=v_org and s.id=p_supplier_id
  ) into v_supplier_exists;
  if not v_supplier_exists then
    raise exception 'supplier not found' using errcode='DP601';
  end if;

  if p_supersedes_id is not null then
    select *
    into v_old
    from public.dpp_supplier_data_packages p
    where p.organization_id=v_org and p.id=p_supersedes_id;

    if not found then
      raise exception 'superseded supplier package not found' using errcode='DP604';
    end if;

    if v_old.supplier_id<>p_supplier_id
       or v_old.subject_kind<>p_subject_kind
       or v_old.subject_ref<>btrim(p_subject_ref)
       or v_old.model_id is distinct from p_model_id
       or v_old.item_id is distinct from p_item_id
       or v_old.component_ref is distinct from nullif(btrim(p_component_ref),'')
       or v_old.material_ref is distinct from nullif(btrim(p_material_ref),'') then
      raise exception 'supersession scope mismatch' using errcode='DP602';
    end if;
  end if;

  insert into public.dpp_supplier_data_packages(
    organization_id,supplier_id,subject_kind,subject_ref,
    model_id,item_id,component_ref,material_ref,payload,source_date,
    verification_status,supersedes_id,created_by
  ) values(
    v_org,p_supplier_id,p_subject_kind,btrim(p_subject_ref),
    p_model_id,p_item_id,nullif(btrim(p_component_ref),''),
    nullif(btrim(p_material_ref),''),p_payload,p_source_date,
    'unverified',p_supersedes_id,v_user
  )
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'supplier_id',v_row.supplier_id,
    'subject_kind',v_row.subject_kind,
    'subject_ref',v_row.subject_ref,
    'model_id',v_row.model_id,
    'item_id',v_row.item_id,
    'component_ref',v_row.component_ref,
    'material_ref',v_row.material_ref,
    'verification_status',v_row.verification_status,
    'supersedes_id',v_row.supersedes_id,
    'source_date',v_row.source_date,
    'created_at',v_row.created_at
  );
exception
  when check_violation or foreign_key_violation then
    raise exception 'invalid supplier package scope' using errcode='DP602';
end
$fn$;

create or replace function public.dpp_api_supplier_package_verify(
  p_package_id uuid,
  p_status text,
  p_evidence_ref text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_user uuid;
  v_package_exists boolean;
  v_row public.dpp_supplier_package_verification_events%rowtype;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor']);
  v_user:=public.dpp_request_user_id();

  if p_package_id is null then
    raise exception 'package id is required' using errcode='DP604';
  end if;
  if p_status is null or p_status not in ('validated','verified','rejected') then
    raise exception 'invalid verification status' using errcode='DP602';
  end if;
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) not between 1 and 1000 then
    raise exception 'invalid evidence ref' using errcode='DP602';
  end if;
  if p_note is not null and length(p_note)>2000 then
    raise exception 'verification note too long' using errcode='DP602';
  end if;

  select exists(
    select 1 from public.dpp_supplier_data_packages p
    where p.organization_id=v_org and p.id=p_package_id
  ) into v_package_exists;
  if not v_package_exists then
    raise exception 'supplier package not found' using errcode='DP604';
  end if;

  insert into public.dpp_supplier_package_verification_events(
    organization_id,package_id,status,evidence_ref,note,recorded_by
  ) values(
    v_org,p_package_id,p_status,btrim(p_evidence_ref),p_note,v_user
  )
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'package_id',v_row.package_id,
    'status',v_row.status,
    'evidence_ref',v_row.evidence_ref,
    'note',v_row.note,
    'recorded_at',v_row.recorded_at
  );
end
$fn$;

revoke all on function public.dpp_api_suppliers_list() from public,anon;
revoke all on function public.dpp_api_supplier_create(text,text) from public,anon;
revoke all on function public.dpp_api_supplier_package_create(uuid,text,text,uuid,uuid,text,text,jsonb,timestamptz,uuid) from public,anon;
revoke all on function public.dpp_api_supplier_package_verify(uuid,text,text,text) from public,anon;

grant execute on function public.dpp_api_suppliers_list() to authenticated;
grant execute on function public.dpp_api_supplier_create(text,text) to authenticated;
grant execute on function public.dpp_api_supplier_package_create(uuid,text,text,uuid,uuid,text,text,jsonb,timestamptz,uuid) to authenticated;
grant execute on function public.dpp_api_supplier_package_verify(uuid,text,text,text) to authenticated;
