-- M05 partial RLS negative security matrix.
-- All table grants used here are transaction-local and rolled back.
-- M05 remains RED until M02/M03 become GREEN.

do $seed$
declare
  u_owner uuid := '71717171-7171-4171-8171-717171717171';
  u_viewer uuid := '72727272-7272-4272-8272-727272727272';
  u_other uuid := '73737373-7373-4373-8373-737373737373';
  org_a uuid := '74747474-7474-4474-8474-747474747474';
  org_b uuid := '75757575-7575-4575-8575-757575757575';
begin
  insert into auth.users(id,is_sso_user,is_anonymous) values
    (u_owner,false,false),(u_viewer,false,false),(u_other,false,false);

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'M05 Org A','m05-org-a'),
    (org_b,'M05 Org B','m05-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_other,'owner');

  insert into public.dpp_battery_models(
    id,organization_id,model_identifier,manufacturer_name,category,canonical_data
  ) values
    ('76767676-7676-4676-8676-767676767676',org_a,'M05-A','M05 A','electric_vehicle','{}'::jsonb),
    ('77777777-7777-4777-8777-777777777777',org_b,'M05-B','M05 B','electric_vehicle','{}'::jsonb);
end
$seed$;

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.dpp_organizations to authenticated;
grant select,insert,update,delete on public.dpp_organization_members to authenticated;
grant select,insert,update,delete on public.dpp_battery_models to authenticated;

set local role authenticated;

do $m05$
declare
  org_a uuid := '74747474-7474-4474-8474-747474747474';
  org_b uuid := '75757575-7575-4575-8575-757575757575';
  v_count integer;
  v_seen boolean;
begin
  perform set_config('request.jwt.claim.sub','71717171-7171-4171-8171-717171717171',true);

  select count(*) into v_count from public.dpp_organizations;
  if v_count<>1 then
    raise exception 'M05 owner saw % organizations instead of 1',v_count;
  end if;

  select count(*) into v_count from public.dpp_battery_models;
  if v_count<>1 then
    raise exception 'M05 owner saw % models instead of 1',v_count;
  end if;

  v_seen:=false;
  begin
    insert into public.dpp_battery_models(
      organization_id,model_identifier,manufacturer_name,category,canonical_data
    ) values(org_b,'M05-CROSS','Cross Tenant','electric_vehicle','{}'::jsonb);
  exception when insufficient_privilege then
    v_seen:=true;
  end;
  if not v_seen then
    raise exception 'M05 cross-tenant INSERT was not denied';
  end if;

  v_seen:=false;
  begin
    update public.dpp_battery_models
    set manufacturer_name='Cross Tenant Update'
    where organization_id=org_b;
    if found then
      raise exception 'M05 cross-tenant UPDATE unexpectedly matched a row';
    end if;
  exception when insufficient_privilege then
    v_seen:=true;
  end;

  perform set_config('request.jwt.claim.sub','72727272-7272-4272-8272-727272727272',true);

  select count(*) into v_count from public.dpp_battery_models where organization_id=org_a;
  if v_count<>1 then
    raise exception 'M05 viewer could not read own-tenant model';
  end if;

  v_seen:=false;
  begin
    insert into public.dpp_battery_models(
      organization_id,model_identifier,manufacturer_name,category,canonical_data
    ) values(org_a,'M05-VIEWER-WRITE','Viewer Write','electric_vehicle','{}'::jsonb);
  exception when insufficient_privilege then
    v_seen:=true;
  end;
  if not v_seen then
    raise exception 'M05 viewer INSERT was not denied';
  end if;

  v_seen:=false;
  begin
    delete from public.dpp_battery_models where organization_id=org_a;
    if found then
      raise exception 'M05 viewer DELETE unexpectedly removed a row';
    end if;
  exception when insufficient_privilege then
    v_seen:=true;
  end;

  perform set_config('request.jwt.claim.sub','73737373-7373-4373-8373-737373737373',true);

  select count(*) into v_count
  from public.dpp_battery_models
  where organization_id=org_a;
  if v_count<>0 then
    raise exception 'M05 other-tenant owner could read org A rows';
  end if;
end
$m05$;

reset role;

select 'M05_RLS_POLICY_SUBSET_PASS' as result;
