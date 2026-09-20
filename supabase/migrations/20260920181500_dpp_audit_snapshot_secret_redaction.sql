-- M12/R07/R08 privacy hardening: redact obvious credential-bearing JSON keys from immutable audit snapshots.
-- Source rows are not modified. This migration only changes the audit copy.

create or replace function public.dpp_redact_audit_json(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path=public,pg_temp
as $fn$
declare
  v_type text;
  v_key text;
  v_child jsonb;
  v_result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  v_type:=jsonb_typeof(p_value);

  if v_type='object' then
    v_result:='{}'::jsonb;
    for v_key,v_child in
      select key,value from jsonb_each(p_value)
    loop
      if lower(v_key) in (
        'password','passwd','secret','token','access_token','refresh_token',
        'authorization','api_key','apikey','supabase_key','client_secret',
        'credential','credentials'
      ) then
        v_result:=v_result || jsonb_build_object(v_key,'[REDACTED]');
      else
        v_result:=v_result || jsonb_build_object(v_key,public.dpp_redact_audit_json(v_child));
      end if;
    end loop;
    return v_result;
  elsif v_type='array' then
    select coalesce(jsonb_agg(public.dpp_redact_audit_json(value)),'[]'::jsonb)
      into v_result
    from jsonb_array_elements(p_value);
    return v_result;
  end if;

  return p_value;
end
$fn$;

create or replace function public.dpp_capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_before jsonb;
  v_after jsonb;
  v_subject jsonb;
  v_org uuid;
  v_target uuid;
  v_actor uuid;
  v_claim text;
begin
  if tg_op='INSERT' then
    v_before:=null;
    v_after:=public.dpp_redact_audit_json(to_jsonb(new));
    v_subject:=to_jsonb(new);
  elsif tg_op='UPDATE' then
    v_before:=public.dpp_redact_audit_json(to_jsonb(old));
    v_after:=public.dpp_redact_audit_json(to_jsonb(new));
    v_subject:=to_jsonb(new);
  elsif tg_op='DELETE' then
    v_before:=public.dpp_redact_audit_json(to_jsonb(old));
    v_after:=null;
    v_subject:=to_jsonb(old);
  else
    raise exception 'unsupported audit operation %',tg_op
      using errcode='0A000';
  end if;

  begin
    if tg_table_name='dpp_organizations' then
      v_org:=nullif(v_subject->>'id','')::uuid;
    else
      v_org:=nullif(v_subject->>'organization_id','')::uuid;
    end if;
  exception when invalid_text_representation then
    v_org:=null;
  end;

  begin
    v_target:=nullif(coalesce(v_subject->>'id',v_subject->>'user_id'),'')::uuid;
  exception when invalid_text_representation then
    v_target:=null;
  end;

  v_claim:=nullif(current_setting('request.jwt.claim.sub',true),'');
  begin
    if v_claim is not null then
      v_actor:=v_claim::uuid;
    else
      v_actor:=nullif(v_subject->>'created_by','')::uuid;
    end if;
  exception when invalid_text_representation then
    v_actor:=null;
  end;

  insert into public.dpp_audit_log(
    organization_id,actor_id,action,target_table,target_id,before_data,after_data
  ) values(
    v_org,v_actor,tg_op,tg_table_name,v_target,v_before,v_after
  );

  return coalesce(new,old);
end
$fn$;

revoke all on function public.dpp_redact_audit_json(jsonb) from public,anon,authenticated;
revoke all on function public.dpp_capture_audit_event() from public,anon,authenticated;

comment on function public.dpp_redact_audit_json(jsonb) is
  'M12/R07 privacy hardening: recursively replaces values under obvious credential-bearing JSON keys with [REDACTED] in audit snapshots only.';
