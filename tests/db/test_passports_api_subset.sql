-- M19 partial integration/security coverage for public/private passport API RPCs.
-- Synthetic auth/users only; CI wraps this file in a transaction and rolls back.

do $seed$
declare
  u_owner uuid := 'b1111111-1111-4111-8111-111111111111';
  u_editor uuid := 'b2222222-2222-4222-8222-222222222222';
  u_viewer uuid := 'b3333333-3333-4333-8333-333333333333';
  u_other uuid := 'b4444444-4444-4444-8444-444444444444';
  org_a uuid := 'b5555555-5555-4555-8555-555555555555';
  org_b uuid := 'b6666666-6666-4666-8666-666666666666';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_editor,u_viewer,u_other
    );
  else
    insert into auth.users(id) values (u_owner),(u_editor),(u_viewer),(u_other);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'M19 Org A','m19-org-a'),
    (org_b,'M19 Org B','m19-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_editor,'editor'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values
    ('b7777777-7777-4777-8777-777777777777',org_a,'M19-MODEL-A','Maker A','electric_vehicle','{}'::jsonb),
    ('b8888888-8888-4888-8888-888888888888',org_b,'M19-MODEL-B','Maker B','industrial','{}'::jsonb);

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data,created_by
  ) values
    ('b9999999-9999-4999-8999-999999999999',org_a,'b7777777-7777-4777-8777-777777777777','urn:dpp:m19:a:1','original','{}'::jsonb,u_owner),
    ('baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',org_a,'b7777777-7777-4777-8777-777777777777','urn:dpp:m19:a:2','original','{}'::jsonb,u_owner),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',org_b,'b8888888-8888-4888-8888-888888888888','urn:dpp:m19:b:1','original','{}'::jsonb,u_other);
end
$seed$;

do $m19$
declare
  org_a uuid := 'b5555555-5555-4555-8555-555555555555';
  org_b uuid := 'b6666666-6666-4666-8666-666666666666';
  item_a uuid := 'b9999999-9999-4999-8999-999999999999';
  item_a2 uuid := 'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  item_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  passport_a uuid;
  passport_b uuid;
  retry_passport uuid;
  payload jsonb;
  seen boolean;
begin
  -- Public read before activation is intentionally unavailable.
  seen:=false;
  begin
    perform public.dpp_api_passport_public('urn:dpp:m19:a:1');
  exception when sqlstate 'DP402' then seen:=true;
  end;
  if not seen then raise exception 'M19 draft/nonexistent public passport was exposed'; end if;

  -- Owner creates a draft with public-safe projection and private restricted data.
  perform set_config('request.jwt.claim.sub','b1111111-1111-4111-8111-111111111111',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_passport_create(
    item_a,
    '{"model":{"identification":{"model_id":"M19-MODEL-A","manufacturer":{"name":"Maker A"}}},"item":{"unique_identifier":"urn:dpp:m19:a:1"}}'::jsonb,
    '{"state_of_health":{"percent":97},"internal_note":"private-only"}'::jsonb
  );
  passport_a:=(payload->>'passport_id')::uuid;
  if payload->>'status'<>'draft' then raise exception 'M19 create did not start draft'; end if;

  -- M23 idempotency: an identical retry must return the same draft, not create a duplicate.
  payload:=public.dpp_api_passport_create(
    item_a,
    '{"model":{"identification":{"model_id":"M19-MODEL-A","manufacturer":{"name":"Maker A"}}},"item":{"unique_identifier":"urn:dpp:m19:a:1"}}'::jsonb,
    '{"state_of_health":{"percent":97},"internal_note":"private-only"}'::jsonb
  );
  retry_passport:=(payload->>'passport_id')::uuid;
  if retry_passport<>passport_a then
    raise exception 'M23 identical passport create retry changed identity';
  end if;
  if (select count(*) from public.dpp_passports where organization_id=org_a and battery_item_id=item_a)<>1 then
    raise exception 'M23 identical passport create retry produced duplicate rows';
  end if;

  -- A retry with different content must fail with a stable conflict instead of raw 23505.
  seen:=false;
  begin
    perform public.dpp_api_passport_create(
      item_a,
      '{"model":{"identification":{"model_id":"M19-MODEL-A","manufacturer":{"name":"Maker A"}}},"item":{"unique_identifier":"urn:dpp:m19:a:1"}}'::jsonb,
      '{"state_of_health":{"percent":12},"internal_note":"different"}'::jsonb
    );
  exception when sqlstate 'DP412' then seen:=true;
  end;
  if not seen then
    raise exception 'M23 divergent passport create retry was not rejected with DP412';
  end if;

  -- M10 enforcement: restricted catalog keys cannot enter public payload.
  seen:=false;
  begin
    perform public.dpp_api_passport_create(
      item_a2,
      '{"model":{"restricted_composition":{"cathode":"secret"}},"item":{"unique_identifier":"urn:dpp:m19:a:2"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP409' then seen:=true;
  end;
  if not seen then raise exception 'M19 restricted model field leaked into public payload'; end if;

  seen:=false;
  begin
    perform public.dpp_api_passport_create(
      item_a2,
      '{"item":{"unique_identifier":"urn:dpp:m19:a:2","state_of_health":{"percent":99}}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP409' then seen:=true;
  end;
  if not seen then raise exception 'M19 restricted item field leaked into public payload'; end if;

  seen:=false;
  begin
    perform public.dpp_api_passport_create(
      item_a2,
      '{"item":{"unique_identifier":"urn:dpp:m19:WRONG"}}'::jsonb,
      '{}'::jsonb
    );
  exception when sqlstate 'DP410' then seen:=true;
  end;
  if not seen then raise exception 'M19 mismatched public identifier was accepted'; end if;

  -- Editor may activate/update within tenant; public RPC then exposes no private payload.
  perform set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_passport_update(passport_a,'active',null,'{"state_of_health":{"percent":96},"internal_note":"private-updated"}'::jsonb);
  if payload->>'status'<>'active' then raise exception 'M19 editor activation failed'; end if;

  payload:=public.dpp_api_passport_public('urn:dpp:m19:a:1');
  if payload->>'status'<>'active' then raise exception 'M19 public active read failed'; end if;
  if payload ? 'private_payload' then raise exception 'M19 public response leaked private_payload key'; end if;
  if (payload->'public_payload')::text like '%private-only%'
     or (payload->'public_payload')::text like '%state_of_health%'
     or (payload->'public_payload')::text like '%internal_note%' then
    raise exception 'M19 public response leaked restricted/private content';
  end if;

  -- Viewer can read private tenant passport but cannot write.
  perform set_config('request.jwt.claim.sub','b3333333-3333-4333-8333-333333333333',true);
  perform public.dpp_set_active_organization(org_a);
  payload:=public.dpp_api_passport_private(passport_a);
  if payload#>>'{private_payload,internal_note}'<>'private-updated' then
    raise exception 'M19 viewer private tenant read failed';
  end if;

  seen:=false;
  begin
    perform public.dpp_api_passport_update(passport_a,'suspended',null,null);
  exception when sqlstate 'DP104' then seen:=true;
  end;
  if not seen then raise exception 'M19 viewer write was not denied'; end if;

  -- Other tenant creates its own passport and cannot read guessed org-A private id.
  perform set_config('request.jwt.claim.sub','b4444444-4444-4444-8444-444444444444',true);
  perform public.dpp_set_active_organization(org_b);
  payload:=public.dpp_api_passport_create(
    item_b,
    '{"model":{"identification":{"model_id":"M19-MODEL-B"}},"item":{"unique_identifier":"urn:dpp:m19:b:1"}}'::jsonb,
    '{"tenant":"B-private"}'::jsonb
  );
  passport_b:=(payload->>'passport_id')::uuid;

  seen:=false;
  begin
    perform public.dpp_api_passport_private(passport_a);
  exception when sqlstate 'DP403' then seen:=true;
  end;
  if not seen then raise exception 'M19 cross-tenant private read was not denied'; end if;

  seen:=false;
  begin
    perform public.dpp_api_passport_update(passport_a,'retired',null,null);
  exception when sqlstate 'DP403' then seen:=true;
  end;
  if not seen then raise exception 'M19 cross-tenant update was not denied'; end if;

  -- Public RPC must be executable without active tenant/auth; private RPC must not be anon-executable.
  perform set_config('request.jwt.claim.sub','',true);
  if not has_function_privilege('anon','public.dpp_api_passport_public(text)','EXECUTE') then
    raise exception 'M19 public RPC missing anon EXECUTE';
  end if;
  if has_function_privilege('anon','public.dpp_api_passport_private(uuid)','EXECUTE') then
    raise exception 'M19 private RPC leaked anon EXECUTE';
  end if;

  if passport_b is null then raise exception 'M19 org-B passport missing'; end if;
end
$m19$;

select 'M19_PASSPORT_API_SUBSET_PASS' as result;
