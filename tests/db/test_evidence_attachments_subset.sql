-- M13 partial evidence metadata + tenant/file-policy regression.
do $seed$
declare
  u_owner uuid := '81818181-8181-4181-8181-818181818181';
  u_viewer uuid := '82828282-8282-4282-8282-828282828282';
  u_other uuid := '83838383-8383-4383-8383-838383838383';
  org_a uuid := '84848484-8484-4484-8484-848484848484';
  org_b uuid := '85858585-8585-4585-8585-858585858585';
begin
  if exists (select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='created_at') then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_viewer,u_other
    );
  else
    insert into auth.users(id) values (u_owner),(u_viewer),(u_other);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'M13 Org A','m13-org-a'),(org_b,'M13 Org B','m13-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),(org_a,u_viewer,'viewer'),(org_b,u_other,'owner');

  insert into public.dpp_battery_models(id,organization_id,model_identifier,manufacturer_name,category,canonical_data) values
    ('86868686-8686-4686-8686-868686868686',org_a,'M13-A','M13 A','electric_vehicle','{}'::jsonb),
    ('87878787-8787-4787-8787-878787878787',org_b,'M13-B','M13 B','electric_vehicle','{}'::jsonb);
end
$seed$;

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.dpp_evidence_attachments to authenticated;
set local role authenticated;

do $m13$
declare
  org_a uuid := '84848484-8484-4484-8484-848484848484';
  org_b uuid := '85858585-8585-4585-8585-858585858585';
  model_a uuid := '86868686-8686-4686-8686-868686868686';
  model_b uuid := '87878787-8787-4787-8787-878787878787';
  v_id uuid; v_count integer; v_seen boolean;
begin
  perform set_config('request.jwt.claim.sub','81818181-8181-4181-8181-818181818181',true);

  insert into public.dpp_evidence_attachments(
    organization_id,related_record_type,related_record_id,storage_path,original_filename,content_type,byte_size,sha256_hex
  ) values(
    org_a,'battery_model',model_a,org_a::text||'/evidence/model-a/report.pdf','report.pdf','application/pdf',1024,repeat('a',64)
  ) returning id into v_id;

  select count(*) into v_count from public.dpp_evidence_attachments where organization_id=org_a and id=v_id;
  if v_count<>1 then raise exception 'M13 owner could not read own evidence metadata'; end if;

  v_seen:=false;
  begin
    insert into public.dpp_evidence_attachments(
      organization_id,related_record_type,related_record_id,storage_path,original_filename,content_type,byte_size,sha256_hex
    ) values(org_b,'battery_model',model_b,org_b::text||'/evidence/cross.pdf','cross.pdf','application/pdf',1024,repeat('b',64));
  exception when insufficient_privilege then v_seen:=true; end;
  if not v_seen then raise exception 'M13 cross-tenant insert was not denied'; end if;

  v_seen:=false;
  begin
    insert into public.dpp_evidence_attachments(
      organization_id,related_record_type,related_record_id,storage_path,original_filename,content_type,byte_size,sha256_hex
    ) values(org_a,'battery_model',model_a,org_a::text||'/evidence/malware.exe','malware.exe','application/x-msdownload',1024,repeat('c',64));
  exception when check_violation then v_seen:=true; end;
  if not v_seen then raise exception 'M13 disallowed MIME type was not rejected'; end if;

  v_seen:=false;
  begin
    insert into public.dpp_evidence_attachments(
      organization_id,related_record_type,related_record_id,storage_path,original_filename,content_type,byte_size,sha256_hex
    ) values(org_a,'battery_model',model_a,org_a::text||'/evidence/too-big.pdf','too-big.pdf','application/pdf',10485761,repeat('d',64));
  exception when check_violation then v_seen:=true; end;
  if not v_seen then raise exception 'M13 oversize file metadata was not rejected'; end if;

  v_seen:=false;
  begin
    insert into public.dpp_evidence_attachments(
      organization_id,related_record_type,related_record_id,storage_path,original_filename,content_type,byte_size,sha256_hex
    ) values(org_a,'battery_model',model_a,org_b::text||'/evidence/wrong-prefix.pdf','wrong-prefix.pdf','application/pdf',1024,repeat('e',64));
  exception when check_violation then v_seen:=true; end;
  if not v_seen then raise exception 'M13 wrong tenant storage-path prefix was not rejected'; end if;

  v_seen:=false;
  begin
    insert into public.dpp_evidence_attachments(
      organization_id,related_record_type,related_record_id,storage_path,original_filename,content_type,byte_size,sha256_hex
    ) values(org_a,'battery_model',model_b,org_a::text||'/evidence/cross-target.pdf','cross-target.pdf','application/pdf',1024,repeat('f',64));
  exception when foreign_key_violation then v_seen:=true; end;
  if not v_seen then raise exception 'M13 cross-tenant related target was not rejected'; end if;

  perform set_config('request.jwt.claim.sub','82828282-8282-4282-8282-828282828282',true);
  select count(*) into v_count from public.dpp_evidence_attachments where organization_id=org_a;
  if v_count<>1 then raise exception 'M13 viewer could not read own-tenant evidence'; end if;

  v_seen:=false;
  begin
    insert into public.dpp_evidence_attachments(
      organization_id,related_record_type,related_record_id,storage_path,original_filename,content_type,byte_size,sha256_hex
    ) values(org_a,'battery_model',model_a,org_a::text||'/evidence/viewer-write.pdf','viewer-write.pdf','application/pdf',1024,repeat('1',64));
  exception when insufficient_privilege then v_seen:=true; end;
  if not v_seen then raise exception 'M13 viewer insert was not denied'; end if;

  perform set_config('request.jwt.claim.sub','83838383-8383-4383-8383-838383838383',true);
  select count(*) into v_count from public.dpp_evidence_attachments where organization_id=org_a;
  if v_count<>0 then raise exception 'M13 other-tenant owner could read org A evidence'; end if;
end
$m13$;

reset role;

do $audit$
declare v_count integer;
begin
  select count(*) into v_count
  from public.dpp_audit_log
  where organization_id='84848484-8484-4484-8484-848484848484'
    and actor_id='81818181-8181-4181-8181-818181818181'
    and action='INSERT'
    and target_table='dpp_evidence_attachments';
  if v_count<>1 then raise exception 'M13 evidence insert audit expected 1 row, got %',v_count; end if;
end
$audit$;

revoke select,insert,update,delete on public.dpp_evidence_attachments from authenticated;

do $metadata_rpc$
declare
  v_meta jsonb;
begin
  if has_table_privilege('authenticated','public.dpp_evidence_attachments','SELECT') then
    raise exception 'M13 direct authenticated evidence metadata SELECT unexpectedly granted';
  end if;

  perform set_config('request.jwt.claim.sub','81818181-8181-4181-8181-818181818181',true);
  execute 'set local role authenticated';
  select public.dpp_api_evidence_object_metadata(
    '84848484-8484-4484-8484-848484848484/evidence/model-a/report.pdf'
  ) into v_meta;
  if v_meta is null
     or (v_meta->>'byte_size')::bigint<>1024
     or v_meta->>'sha256_hex'<>repeat('a',64)
     or v_meta->>'content_type'<>'application/pdf' then
    raise exception 'M13 minimal metadata RPC did not return expected integrity tuple: %',v_meta;
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','82828282-8282-4282-8282-828282828282',true);
  execute 'set local role authenticated';
  select public.dpp_api_evidence_object_metadata(
    '84848484-8484-4484-8484-848484848484/evidence/model-a/report.pdf'
  ) into v_meta;
  if v_meta is null then
    raise exception 'M13 same-tenant viewer metadata RPC unexpectedly denied';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','83838383-8383-4383-8383-838383838383',true);
  execute 'set local role authenticated';
  select public.dpp_api_evidence_object_metadata(
    '84848484-8484-4484-8484-848484848484/evidence/model-a/report.pdf'
  ) into v_meta;
  if v_meta is not null then
    raise exception 'M13 cross-tenant metadata RPC leaked object integrity metadata: %',v_meta;
  end if;
  execute 'reset role';

  if has_function_privilege('anon','public.dpp_api_evidence_object_metadata(text)','EXECUTE') then
    raise exception 'M13 anon unexpectedly has metadata RPC EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.dpp_api_evidence_object_metadata(text)','EXECUTE') then
    raise exception 'M13 authenticated metadata RPC EXECUTE missing';
  end if;
end
$metadata_rpc$;

select 'M13_EVIDENCE_METADATA_SUBSET_PASS' as result;
