-- R04 partial tenant-isolation security matrix at the database boundary.
-- Temporary grants/synthetic users are transaction-scoped and rolled back.
-- R04 remains RED until M17-M21 API/export surfaces exist and are attack-tested.

do $seed$
declare
  u_owner_a uuid := '91919191-9191-4191-8191-919191919191';
  u_viewer_a uuid := '92929292-9292-4292-8292-929292929292';
  u_owner_b uuid := '93939393-9393-4393-8393-939393939393';
  org_a uuid := '94949494-9494-4494-8494-949494949494';
  org_b uuid := '95959595-9595-4595-8595-959595959595';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner_a,u_viewer_a,u_owner_b
    );
  else
    insert into auth.users(id) values (u_owner_a),(u_viewer_a),(u_owner_b);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'R04 Org A','r04-org-a'),
    (org_b,'R04 Org B','r04-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner_a,'owner'),
    (org_a,u_viewer_a,'viewer'),
    (org_b,u_owner_b,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values
    ('96969696-9696-4696-8696-969696969696',org_a,'R04-MODEL-A','R04 A','electric_vehicle','{}'::jsonb),
    ('97979797-9797-4797-8797-979797979797',org_b,'R04-MODEL-B','R04 B','electric_vehicle','{}'::jsonb);

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data
  ) values
    ('98989898-9898-4898-8898-989898989898',org_a,'96969696-9696-4696-8696-969696969696','urn:dpp:r04:item:a','original','{}'::jsonb),
    ('99999999-9999-4999-8999-999999999999',org_b,'97979797-9797-4797-8797-979797979797','urn:dpp:r04:item:b','original','{}'::jsonb);

  insert into public.dpp_passports(
    id,organization_id,battery_item_id,status,public_payload,private_payload
  ) values
    ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1',org_a,'98989898-9898-4898-8898-989898989898','active','{"label":"A"}'::jsonb,'{"secret":"A"}'::jsonb),
    ('b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2',org_b,'99999999-9999-4999-8999-999999999999','active','{"label":"B"}'::jsonb,'{"secret":"B"}'::jsonb);

  insert into public.dpp_evidence_attachments(
    id,organization_id,related_record_type,related_record_id,storage_path,
    original_filename,content_type,byte_size,sha256_hex
  ) values
    ('c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3',org_a,'battery_model','96969696-9696-4696-8696-969696969696',
     org_a::text||'/evidence/r04-a.pdf','r04-a.pdf','application/pdf',512,repeat('a',64)),
    ('d4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4',org_b,'battery_model','97979797-9797-4797-8797-979797979797',
     org_b::text||'/evidence/r04-b.pdf','r04-b.pdf','application/pdf',512,repeat('b',64));
end
$seed$;

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.dpp_organizations to authenticated;
grant select,insert,update,delete on public.dpp_organization_members to authenticated;
grant select,insert,update,delete on public.dpp_battery_models to authenticated;
grant select,insert,update,delete on public.dpp_battery_items to authenticated;
grant select,insert,update,delete on public.dpp_passports to authenticated;
grant select on public.dpp_passport_versions to authenticated;
grant select,insert,update,delete on public.dpp_evidence_attachments to authenticated;
grant select on public.dpp_audit_log to authenticated;

set local role authenticated;

do $r04$
declare
  org_a uuid := '94949494-9494-4494-8494-949494949494';
  org_b uuid := '95959595-9595-4595-8595-959595959595';
  v_count integer;
  v_seen boolean;
begin
  -- Owner A can only enumerate own tenant data across all protected tables.
  perform set_config('request.jwt.claim.sub','91919191-9191-4191-8191-919191919191',true);

  select count(*) into v_count from public.dpp_battery_models;
  if v_count<>1 then raise exception 'R04 owner A model visibility expected 1, got %',v_count; end if;

  select count(*) into v_count from public.dpp_battery_items;
  if v_count<>1 then raise exception 'R04 owner A item visibility expected 1, got %',v_count; end if;

  select count(*) into v_count from public.dpp_passports;
  if v_count<>1 then raise exception 'R04 owner A passport visibility expected 1, got %',v_count; end if;

  select count(*) into v_count from public.dpp_passport_versions;
  if v_count<>1 then raise exception 'R04 owner A passport history visibility expected 1, got %',v_count; end if;

  select count(*) into v_count from public.dpp_evidence_attachments;
  if v_count<>1 then raise exception 'R04 owner A evidence visibility expected 1, got %',v_count; end if;

  select count(*) into v_count
  from public.dpp_audit_log
  where organization_id=org_b;
  if v_count<>0 then raise exception 'R04 owner A could read org B audit rows'; end if;

  -- ID guessing must not allow cross-tenant update/delete.
  update public.dpp_battery_models
  set manufacturer_name='ATTACK'
  where id='97979797-9797-4797-8797-979797979797';
  if found then raise exception 'R04 guessed cross-tenant model id allowed UPDATE'; end if;

  delete from public.dpp_evidence_attachments
  where id='d4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4';
  if found then raise exception 'R04 guessed cross-tenant evidence id allowed DELETE'; end if;

  -- Forged tenant inserts must be denied by RLS before target ownership is trusted.
  v_seen:=false;
  begin
    insert into public.dpp_battery_models(
      organization_id,model_identifier,manufacturer_name,category,canonical_data
    ) values(org_b,'R04-FORGED-MODEL','Forged','electric_vehicle','{}'::jsonb);
  exception when insufficient_privilege then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R04 forged org B model insert was not denied'; end if;

  v_seen:=false;
  begin
    insert into public.dpp_evidence_attachments(
      organization_id,related_record_type,related_record_id,storage_path,
      original_filename,content_type,byte_size,sha256_hex
    ) values(
      org_b,'battery_model','97979797-9797-4797-8797-979797979797',
      org_b::text||'/evidence/forged.pdf','forged.pdf','application/pdf',100,repeat('c',64)
    );
  exception when insufficient_privilege then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'R04 forged org B evidence insert was not denied'; end if;

  -- Viewer A sees tenant operational data but cannot mutate or read audit history.
  perform set_config('request.jwt.claim.sub','92929292-9292-4292-8292-929292929292',true);

  select count(*) into v_count from public.dpp_passports where organization_id=org_a;
  if v_count<>1 then raise exception 'R04 viewer A could not read own passport'; end if;

  select count(*) into v_count from public.dpp_audit_log where organization_id=org_a;
  if v_count<>0 then raise exception 'R04 viewer A could read audit rows'; end if;

  update public.dpp_battery_items
  set lifecycle_status='retired'
  where id='98989898-9898-4898-8898-989898989898';
  if found then raise exception 'R04 viewer A allowed item UPDATE'; end if;

  -- Owner B cannot infer or read A by direct IDs.
  perform set_config('request.jwt.claim.sub','93939393-9393-4393-8393-939393939393',true);

  select count(*) into v_count
  from public.dpp_passports
  where id='a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';
  if v_count<>0 then raise exception 'R04 owner B could read passport A by guessed id'; end if;

  select count(*) into v_count
  from public.dpp_evidence_attachments
  where id='c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3';
  if v_count<>0 then raise exception 'R04 owner B could read evidence A by guessed id'; end if;
end
$r04$;

reset role;

select 'R04_DB_TENANT_ISOLATION_SUBSET_PASS' as result;
