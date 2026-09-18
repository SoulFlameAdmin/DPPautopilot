-- T08 reliability fix: every transition into submitted counts as a new registry attempt.
-- Preserve the first submitted_at timestamp while incrementing attempt_count on retries.

create or replace function public.dpp_enforce_registry_status_transition()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
begin
  if not public.dpp_registry_status_transition_allowed(old.status,new.status) then
    raise exception 'invalid DPP registry status transition: % -> %',old.status,new.status
      using errcode='23514';
  end if;

  if old.status is distinct from new.status then
    new.updated_at := now();

    if new.status='queued' and new.queued_at is null then
      new.queued_at := now();
    end if;

    if new.status='submitted' then
      new.attempt_count := old.attempt_count + 1;
      if new.submitted_at is null then
        new.submitted_at := now();
      end if;
    end if;

    if new.status='accepted' and new.accepted_at is null then
      new.accepted_at := now();
    end if;

    if new.status='rejected' and new.rejected_at is null then
      new.rejected_at := now();
    end if;
  end if;

  return new;
end
$fn$;

revoke all on function public.dpp_enforce_registry_status_transition() from public,anon,authenticated;
