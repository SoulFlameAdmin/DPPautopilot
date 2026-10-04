-- Step 19: production completeness workflow by battery identifier.
-- Adds an authenticated, tenant-scoped readiness report with workflow score
-- and optimistic-concurrency metadata for the final activation action.

create or replace function public.dpp_api_scooter_completeness_by_identifier(
  p_unique_identifier text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $fn$
declare
  v_org uuid;
  v_identifier text;
  v_item public.dpp_battery_items%rowtype;
  v_model public.dpp_battery_models%rowtype;
  v_passport public.dpp_passports%rowtype;
  v_report jsonb;
  v_model_app jsonb;
  v_item_app jsonb;
  v_applicable_conditionals integer := 0;
  v_required integer := 0;
  v_complete integer := 0;
  v_missing integer := 0;
  v_undecided integer := 0;
  v_workflow_total integer := 0;
  v_score numeric := 0;
begin
  v_org:=public.dpp_require_active_role(array['owner','admin','editor','viewer']);
  v_identifier:=btrim(coalesce(p_unique_identifier,''));

  if length(v_identifier) not between 1 and 300 or v_identifier ~ '[[:cntrl:]]' then
    raise exception 'unique_identifier must contain 1..300 printable characters' using errcode='DP603';
  end if;

  select i.* into v_item
  from public.dpp_battery_items i
  where i.organization_id=v_org
    and i.unique_identifier=v_identifier;

  if not found then
    raise exception 'battery item not found in active organization' using errcode='DP405';
  end if;

  select m.* into v_model
  from public.dpp_battery_models m
  where m.organization_id=v_org
    and m.id=v_item.model_id;

  if not found then
    raise exception 'battery model not found in active organization' using errcode='DP601';
  end if;

  if v_model.category<>'light_means_of_transport' then
    raise exception 'battery model is not an LMT model' using errcode='DP602';
  end if;

  select p.* into v_passport
  from public.dpp_passports p
  where p.organization_id=v_org
    and p.battery_item_id=v_item.id;

  if not found then
    raise exception 'passport not found in active organization' using errcode='DP403';
  end if;

  v_report:=public.dpp_api_scooter_passport_readiness(v_passport.id);
  v_model_app:=coalesce(v_model.canonical_data->'point_applicability','{}'::jsonb);
  v_item_app:=coalesce(v_item.canonical_data->'point_applicability','{}'::jsonb);

  -- The launch contract has 50 unconditional mandatory points.
  -- These 8 conditional points are required only when explicitly true.
  v_applicable_conditionals :=
      case when v_model_app->>'35'='true' then 1 else 0 end
    + case when v_model_app->>'41'='true' then 1 else 0 end
    + case when v_item_app->>'57'='true' then 1 else 0 end
    + case when v_item_app->>'58'='true' then 1 else 0 end
    + case when v_item_app->>'68'='true' then 1 else 0 end
    + case when v_item_app->>'69'='true' then 1 else 0 end
    + case when v_item_app->>'70'='true' then 1 else 0 end
    + case when v_item_app->>'71'='true' then 1 else 0 end;

  v_missing:=coalesce((v_report->>'missing_count')::integer,0);
  v_undecided:=coalesce((v_report->>'undecided_count')::integer,0);
  v_required:=50+v_applicable_conditionals;
  v_complete:=greatest(v_required-v_missing,0);

  -- Unresolved applicability decisions count as incomplete workflow work.
  v_workflow_total:=v_required+v_undecided;
  v_score:=case
    when v_workflow_total=0 then 100
    else round((v_complete::numeric/v_workflow_total::numeric)*100,1)
  end;

  return v_report || jsonb_build_object(
    'passport_updated_at',v_passport.updated_at,
    'required_point_count',v_required,
    'complete_point_count',v_complete,
    'blocking_count',v_missing+v_undecided,
    'workflow_score_percent',v_score
  );
end
$fn$;

revoke all on function public.dpp_api_scooter_completeness_by_identifier(text)
from public,anon;
grant execute on function public.dpp_api_scooter_completeness_by_identifier(text)
to authenticated;

comment on function public.dpp_api_scooter_completeness_by_identifier(text) is
  'Step 19 production completeness workflow report for one LMT battery in the active tenant. Includes blockers, score and passport updated_at for gated activation; returns no authority-only evidence payload.';
