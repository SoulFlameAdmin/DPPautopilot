-- M13 Storage policy regression.
-- Vanilla PostgreSQL CI validates the path parser and skips only Supabase-hosted storage.objects operations.
-- Bound Supabase execution must produce M13_EVIDENCE_STORAGE_RLS_SUBSET_PASS.

do $path$
begin
  if public.dpp_evidence_storage_org_id('84848484-8484-4484-8484-848484848484/evidence/report.pdf')
     <> '84848484-8484-4484-8484-848484848484'::uuid then
    raise exception 'M13 storage path parser rejected valid organization prefix';
  end if;
  if public.dpp_evidence_storage_org_id('../unsafe.pdf') is not null then
    raise exception 'M13 storage path parser allowed traversal';
  end if;
  if public.dpp_evidence_storage_org_id('not-a-uuid/evidence/report.pdf') is not null then
    raise exception 'M13 storage path parser allowed malformed organization prefix';
  end if;
end
$path$;

do $storage_test$
declare
  u_owner uuid := '91818181-8181-4181-8181-818181818181';
  u_editor uuid := '92828282-8282-4282-8282-828282828282';
  u_viewer uuid := '93838383-8383-4383-8383-838383838383';
  u_other uuid := '94848484-8484-4484-8484-848484848484';
  org_a uuid := '95858585-8585-4585-8585-858585858585';
  org_b uuid := '96868686-8686-4686-8686-868686868686';
  model_a uuid := '97878787-8787-4787-8787-878787878787';
  object_name text;
  v_count integer;
  v_denied boolean;
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice 'M13_STORAGE_RLS_LOCAL_SKIP_STORAGE_SCHEMA';
    return;
  end if;

  object_name:=org_a::text||'/evidence/storage-policy-report.pdf';

  if not exists(
    select 1 from storage.buckets
    where id='dpp-evidence' and public=false and file_size_limit=10485760
      and allowed_mime_types @> array['application/pdf','image/png','image/jpeg','text/csv','application/json']::text[]
  ) then
    raise exception 'M13 private dpp-evidence bucket restrictions missing';
  end if;

  if exists (select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='created_at') then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_editor,u_viewer,u_other
    );
  else
    insert into auth.users(id) values (u_owner),(u_editor),(u_viewer),(u_other);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'M13 Storage Org A','m13-storage-org-a'),
    (org_b,'M13 Storage Org B','m13-storage-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),(org_a,u_editor,'editor'),(org_a,u_viewer,'viewer'),(org_b,u_other,'owner');

  insert into public.dpp_battery_models(id,organization_id,model_identifier,manufacturer_name,category,canonical_data)
  values(model_a,org_a,'M13-STORAGE-A','M13 Storage','electric_vehicle','{}'::jsonb);

  insert into public.dpp_evidence_attachments(
    organization_id,related_record_type,related_record_id,storage_path,original_filename,content_type,byte_size,sha256_hex
  ) values(
    org_a,'battery_model',model_a,object_name,'storage-policy-report.pdf','application/pdf',1024,repeat('a',64)
  );

  perform set_config('request.jwt.claim.sub',u_editor::text,true);
  execute 'set local role authenticated';

  execute format(
    'insert into storage.objects(bucket_id,name,owner_id,metadata) values (%L,%L,%L,%L::jsonb)',
    'dpp-evidence',object_name,u_editor::text,'{"mimetype":"application/pdf","size":1024}'
  );

  execute 'reset role';

  perform set_config('request.jwt.claim.sub',u_viewer::text,true);
  execute 'set local role authenticated';
  execute format('select count(*) from storage.objects where bucket_id=%L and name=%L','dpp-evidence',object_name) into v_count;
  if v_count<>1 then raise exception 'M13 viewer could not read registered object'; end if;

  v_denied:=false;
  begin
    execute format('update storage.objects set user_metadata=%L::jsonb where bucket_id=%L and name=%L','{"overwrite":true}','dpp-evidence',object_name);
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'M13 overwrite/update was not denied'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',u_editor::text,true);
  execute 'set local role authenticated';
  v_denied:=false;
  begin
    execute format('delete from storage.objects where bucket_id=%L and name=%L','dpp-evidence',object_name);
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'M13 editor object delete was not denied'; end if;

  v_denied:=false;
  begin
    execute format(
      'insert into storage.objects(bucket_id,name,owner_id) values (%L,%L,%L)',
      'dpp-evidence',org_a::text||'/evidence/unregistered.pdf',u_editor::text
    );
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'M13 unregistered object upload metadata was not denied'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',u_other::text,true);
  execute 'set local role authenticated';
  execute format('select count(*) from storage.objects where bucket_id=%L and name=%L','dpp-evidence',object_name) into v_count;
  if v_count<>0 then raise exception 'M13 cross-tenant storage read was not denied'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',u_owner::text,true);
  execute 'set local role authenticated';
  execute format('delete from storage.objects where bucket_id=%L and name=%L','dpp-evidence',object_name);
  execute 'reset role';

  select count(*) into v_count from storage.objects where bucket_id='dpp-evidence' and name=object_name;
  if v_count<>0 then raise exception 'M13 owner/admin storage delete failed'; end if;

  raise notice 'M13_EVIDENCE_STORAGE_RLS_SUBSET_PASS';
end
$storage_test$;
