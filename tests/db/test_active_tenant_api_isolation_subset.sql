-- M05 active-tenant API isolation matrix.
-- Proves a user who belongs to two tenants only receives data for the explicitly active tenant through server-side RPCs.
-- Caller must wrap this file in a rollback transaction.

do $seed$
declare
  u_multi uuid := 'b1818181-8181-4181-8181-818181818181';
  org_a uuid := 'b2828282-8282-4282-8282-828282828282';
  org_b uuid := 'b3838383-8383-4383-8383-838383838383';
  model_a uuid := 'b4848484-8484-4484-8484-848484848484';
  model_b uuid := 'b5858585-8585-4585-8585-858585858585';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false)',
      u_multi
    );
  else
    insert into auth.users(id) values (u_multi);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'Active Tenant A','active-tenant-a'),
    (org_b,'Active Tenant B','active-tenant-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_multi,'owner'),
    (org_b,u_multi,'admin');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values
    (model_a,org_a,'ACTIVE-A','Tenant A','electric_vehicle','{}'::jsonb),
    (model_b,org_b,'ACTIVE-B','Tenant B','industrial','{}'::jsonb);

  insert into public.dpp_battery_items(
    id,organization_id,model_id,unique_identifier,lifecycle_status,canonical_data
  ) values
    ('b6868686-8686-4686-8686-868686868686',org_a,model_a,'urn:dpp:active:a','original','{}'::jsonb),
    ('b7878787-8787-4787-8787-878787878787',org_b,model_b,'urn:dpp:active:b','original','{}'::jsonb);
end
$seed$;

do $matrix$
declare
  org_a uuid := 'b2828282-8282-4282-8282-828282828282';
  org_b uuid := 'b3838383-8383-4383-8383-838383838383';
  models jsonb;
  items jsonb;
  bundle jsonb;
begin
  perform set_config('request.jwt.claim.sub','b1818181-8181-4181-8181-818181818181',true);

  perform public.dpp_api_tenant_context_set(org_a);
  models:=public.dpp_api_models_list();
  items:=public.dpp_api_items_list();
  bundle:=public.dpp_api_export_bundle();

  if jsonb_array_length(models)<>1 or models->0->>'model_identifier'<>'ACTIVE-A' then
    raise exception 'M05 active tenant A model isolation failed: %',models;
  end if;
  if jsonb_array_length(items)<>1 or items->0->>'unique_identifier'<>'urn:dpp:active:a' then
    raise exception 'M05 active tenant A item isolation failed: %',items;
  end if;
  if bundle->>'organization_id'<>org_a::text then
    raise exception 'M05 export did not bind to active tenant A';
  end if;
  if (bundle->'counts'->>'battery_models')::integer<>1
     or (bundle->'counts'->>'battery_items')::integer<>1 then
    raise exception 'M05 tenant A export counts drifted: %',bundle->'counts';
  end if;

  perform public.dpp_api_tenant_context_set(org_b);
  models:=public.dpp_api_models_list();
  items:=public.dpp_api_items_list();
  bundle:=public.dpp_api_export_bundle();

  if jsonb_array_length(models)<>1 or models->0->>'model_identifier'<>'ACTIVE-B' then
    raise exception 'M05 active tenant B model isolation failed: %',models;
  end if;
  if jsonb_array_length(items)<>1 or items->0->>'unique_identifier'<>'urn:dpp:active:b' then
    raise exception 'M05 active tenant B item isolation failed: %',items;
  end if;
  if bundle->>'organization_id'<>org_b::text then
    raise exception 'M05 export did not bind to active tenant B';
  end if;
  if (bundle->'counts'->>'battery_models')::integer<>1
     or (bundle->'counts'->>'battery_items')::integer<>1 then
    raise exception 'M05 tenant B export counts drifted: %',bundle->'counts';
  end if;

  if exists(
    select 1 from jsonb_array_elements(models) x
    where x->>'model_identifier'='ACTIVE-A'
  ) then
    raise exception 'M05 tenant A model leaked after switch to tenant B';
  end if;
end
$matrix$;

select 'M05_ACTIVE_TENANT_API_ISOLATION_PASS' as result;
