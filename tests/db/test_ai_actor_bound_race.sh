#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -h 127.0.0.1 -U postgres -d dpp_ai_intake -v ON_ERROR_STOP=1 -X)
OWNER_ID='e6111111-1111-4111-8111-111111111111'
EDITOR_ID='e6222222-2222-4222-8222-222222222222'
REQUEST_ID='e7000000-0000-4000-8000-000000000001'

setup="$(${PSQL[@]} -At <<SQL
insert into auth.users(id) values('$OWNER_ID'::uuid),('$EDITOR_ID'::uuid);
set role authenticated;
select set_config('request.jwt.claim.sub','$OWNER_ID',false) as ignored \gset
select (public.dpp_api_organization_create('AI Actor Race Org','ai-actor-race-org')->>'organization_id') as org_id \gset
select public.dpp_api_tenant_context_set(:'org_id'::uuid) as ignored \gset
select public.dpp_api_members_add('$EDITOR_ID'::uuid,'editor') as ignored \gset
select (x->>'id') as session_id,(x->>'revision') as revision
from (select public.dpp_api_ai_intake_resume_or_create() x) s \gset
\echo :org_id|:session_id|:revision
SQL
)"

IFS='|' read -r ORG_ID SESSION_ID REVISION <<<"$setup"
if [[ -z "${ORG_ID:-}" || -z "${SESSION_ID:-}" || -z "${REVISION:-}" ]]; then
  echo "Failed to create actor-race fixture: $setup" >&2
  exit 1
fi

owner_log="$(mktemp)"
editor_log="$(mktemp)"
cleanup() { rm -f "$owner_log" "$editor_log"; }
trap cleanup EXIT

# Session 1 executes the request but deliberately keeps the transaction open,
# preserving the session-row FOR UPDATE lock after the request has been written.
${PSQL[@]} >"$owner_log" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$OWNER_ID',true);
select public.dpp_api_tenant_context_set('$ORG_ID'::uuid);
select public.dpp_api_ai_intake_turn_save_cas(
  '$SESSION_ID'::uuid,$REVISION,'$REQUEST_ID'::uuid,
  'Concurrent actor-bound request',
  '[]'::jsonb,
  null,
  'conversation:actor-race:1'
);
\echo OWNER_LOCK_HELD
select pg_sleep(3);
commit;
SQL
owner_pid=$!

# Do not start the competing actor until the first request has executed and the
# transaction is visibly holding the session lock.
for _ in $(seq 1 50); do
  if grep -q 'OWNER_LOCK_HELD' "$owner_log"; then
    break
  fi
  if ! kill -0 "$owner_pid" 2>/dev/null; then
    cat "$owner_log" >&2
    echo 'Owner race session exited before lock marker' >&2
    exit 1
  fi
  sleep 0.1
done
if ! grep -q 'OWNER_LOCK_HELD' "$owner_log"; then
  cat "$owner_log" >&2
  echo 'Timed out waiting for owner lock marker' >&2
  exit 1
fi

# Session 2 uses the same tenant/session/request_id/content as another writable
# user. It must wait for session 1 and then fail closed as DP409 rather than
# receiving the first actor's cached response.
${PSQL[@]} >"$editor_log" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$EDITOR_ID',true);
select public.dpp_api_tenant_context_set('$ORG_ID'::uuid);
do \$race\$
declare
  denied boolean := false;
begin
  begin
    perform public.dpp_api_ai_intake_turn_save_cas(
      '$SESSION_ID'::uuid,$REVISION,'$REQUEST_ID'::uuid,
      'Concurrent actor-bound request',
      '[]'::jsonb,
      null,
      'conversation:actor-race:1'
    );
  exception when sqlstate 'DP409' then
    denied := true;
  end;
  if not denied then
    raise exception 'Concurrent editor replay did not fail DP409';
  end if;
  raise notice 'AI_ACTOR_BOUND_RACE_DP409_PASS';
end
\$race\$;
rollback;
SQL

wait "$owner_pid"

grep -q 'AI_ACTOR_BOUND_RACE_DP409_PASS' "$editor_log"
echo 'AI_ACTOR_BOUND_RACE_DB_PASS'
