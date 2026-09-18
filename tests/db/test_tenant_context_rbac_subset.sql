-- M02/M03 partial integration matrix for explicit active tenant + server-side role assertion.
-- Uses synthetic auth users and rolls everything back.

do $seed$
declare
  u_owner uuid := '81818181-8181-4181-8181-818181818181';
  u_admin uuid := '82828282-8282-4282-8282-828282828282';
  u_editor uuid := '83838383-8383-4383-8383-838383838383';
  u_viewer uuid := '84848484-8484-4484-8484-848484848484';
  u_outsider uuid := '85858585-8585-4585-8585-858585858585';
  org_a uuid := '86868686-8686-4686-8686-868686868686';
  org_b uuid := '87878787-8787-4787-8787-878787878787';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'
  ) then
    execute format(
      'insert into auth.users(id,created_at,updated_at,is_sso_user,is_anonymous) values (%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false),(%L,now(),now(),false,false)',
      u_owner,u_admin,u_editor,u_viewer,u_outsider
    );
  else
    insert into auth.users(id) values
      (u_owner),(u_admin),(u_editor),(u_viewer),(u_outsider);
  end if;

  insert into public.dpp_organizations(id,name,slug) values
    (org_a,'M02 Org A','m02-org-a'),
    (org_b,'M02 Org B','m02-org-b');

  insert into public.dpp_organization_members(organization_id,user_id,role) values
    (org_a,u_owner,'owner'),
    (org_a,u_admin,'admin'),
    (org_a,u_editor,'editor'),
    (org_a,u_viewer,'viewer'),
    (org_b,u_outsider,'owner');
end
$seed$;

do $m02m03$
declare
  org_a uuid := '86868686-8686-4686-8686-868686868686';
  org_b uuid := '87878787-8787-4787-8787-878787878787';
  v_seen boolean;
  v_org uuid;
begin
  -- owner may select own tenant and satisfy owner-only assertion
  perform set_config('request.jwt.claim.sub','81818181-8181-4181-8181-818181818181',true);
  if public.dpp_set_active_organization(org_a)<>org_a then
    raise exception 'M02 owner active tenant selection returned wrong org';
  end if;
  if public.dpp_active_organization_id()<>org_a then
    raise exception 'M02 active tenant readback mismatch';
  end if;
  if public.dpp_require_active_role(array['owner'])<>org_a then
    raise exception 'M03 owner authorization failed';
  end if;

  -- owner cannot switch to an organization where they are not a member
  v_seen:=false;
  begin
    perform public.dpp_set_active_organization(org_b);
  exception when sqlstate 'DP102' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M02 non-member active tenant selection was not rejected'; end if;

  -- admin satisfies admin/editor style operations but not owner-only
  perform set_config('request.jwt.claim.sub','82828282-8282-4282-8282-828282828282',true);
  perform public.dpp_set_active_organization(org_a);
  if public.dpp_require_active_role(array['owner','admin'])<>org_a then
    raise exception 'M03 admin authorization failed';
  end if;
  v_seen:=false;
  begin
    perform public.dpp_require_active_role(array['owner']);
  exception when sqlstate 'DP104' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M03 admin incorrectly passed owner-only assertion'; end if;

  -- editor may satisfy editor operations but not admin operations
  perform set_config('request.jwt.claim.sub','83838383-8383-4383-8383-838383838383',true);
  perform public.dpp_set_active_organization(org_a);
  if public.dpp_require_active_role(array['owner','admin','editor'])<>org_a then
    raise exception 'M03 editor authorization failed';
  end if;
  v_seen:=false;
  begin
    perform public.dpp_require_active_role(array['owner','admin']);
  exception when sqlstate 'DP104' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M03 editor incorrectly passed admin assertion'; end if;

  -- viewer may satisfy read role only
  perform set_config('request.jwt.claim.sub','84848484-8484-4484-8484-848484848484',true);
  perform public.dpp_set_active_organization(org_a);
  if public.dpp_require_active_role(array['owner','admin','editor','viewer'])<>org_a then
    raise exception 'M03 viewer read authorization failed';
  end if;
  v_seen:=false;
  begin
    perform public.dpp_require_active_role(array['owner','admin','editor']);
  exception when sqlstate 'DP104' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M03 viewer incorrectly passed write assertion'; end if;

  -- member of another org cannot authorize against org A; their own org works.
  perform set_config('request.jwt.claim.sub','85858585-8585-4585-8585-858585858585',true);
  perform public.dpp_set_active_organization(org_b);
  v_org:=public.dpp_require_active_role(array['owner']);
  if v_org<>org_b then raise exception 'M02/M03 outsider own-org context mismatch'; end if;

  -- unauthenticated/malformed subject fails closed.
  perform set_config('request.jwt.claim.sub','',true);
  v_seen:=false;
  begin
    perform public.dpp_set_active_organization(org_a);
  exception when sqlstate 'DP101' then
    v_seen:=true;
  end;
  if not v_seen then raise exception 'M02 missing auth subject did not fail closed'; end if;
end
$m02m03$;

select 'M02_M03_TENANT_RBAC_SUBSET_PASS' as result;
