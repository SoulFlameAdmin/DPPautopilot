#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=dpp_step18}"
: "${PGPASSWORD:=postgres}"
export PGPASSWORD

PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -Atq)
USER_ID="d1818181-8181-4181-8181-818181818181"
OUT1="$(mktemp)"
OUT2="$(mktemp)"
trap 'rm -f "$OUT1" "$OUT2"' EXIT

"${PSQL[@]}" <<SQL
insert into auth.users(id) values ('$USER_ID') on conflict (id) do nothing;
delete from public.dpp_user_tenant_context where user_id='$USER_ID';
delete from public.dpp_organization_members where user_id='$USER_ID';
SQL

(
  "${PSQL[@]}" >"$OUT1" <<SQL
begin;
select set_config('request.jwt.claim.sub','$USER_ID',true);
select public.dpp_api_organization_ensure('Parallel Org A','parallel-org-a')->>'organization_id';
select pg_sleep(2);
commit;
SQL
) &
PID1=$!

# Wait until session 1 is definitely holding the advisory transaction lock.
LOCK_SEEN=0
for _ in $(seq 1 80); do
  if [[ "$("${PSQL[@]}" -c "select count(*) from pg_locks where locktype='advisory' and granted;")" -gt 0 ]]; then
    LOCK_SEEN=1
    break
  fi
  sleep 0.05
done
if [[ "$LOCK_SEEN" -ne 1 ]]; then
  echo "P0 parallel tenant test could not observe the advisory lock" >&2
  kill "$PID1" 2>/dev/null || true
  wait "$PID1" 2>/dev/null || true
  exit 1
fi

(
  "${PSQL[@]}" >"$OUT2" <<SQL
begin;
select set_config('request.jwt.claim.sub','$USER_ID',true);
select public.dpp_api_organization_ensure('Parallel Org B','parallel-org-b')->>'organization_id';
commit;
SQL
) &
PID2=$!

wait "$PID1"
wait "$PID2"

ORG1="$(grep -E '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "$OUT1" | tail -n1)"
ORG2="$(grep -E '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "$OUT2" | tail -n1)"

if [[ -z "$ORG1" || -z "$ORG2" || "$ORG1" != "$ORG2" ]]; then
  echo "P0 parallel ensure returned different tenant ids: '$ORG1' vs '$ORG2'" >&2
  exit 1
fi

MEMBERSHIPS="$("${PSQL[@]}" -c "select count(*) from public.dpp_organization_members where user_id='$USER_ID';")"
ACTIVE="$("${PSQL[@]}" -c "select active_organization_id from public.dpp_user_tenant_context where user_id='$USER_ID';")"
MATCHING_ORGS="$("${PSQL[@]}" -c "select count(*) from public.dpp_organizations where slug in ('parallel-org-a','parallel-org-b');")"

if [[ "$MEMBERSHIPS" != "1" ]]; then
  echo "P0 parallel ensure created $MEMBERSHIPS memberships, expected 1" >&2
  exit 1
fi
if [[ "$ACTIVE" != "$ORG1" ]]; then
  echo "P0 parallel ensure active tenant '$ACTIVE' does not match '$ORG1'" >&2
  exit 1
fi
if [[ "$MATCHING_ORGS" != "1" ]]; then
  echo "P0 parallel ensure created $MATCHING_ORGS candidate organizations, expected 1" >&2
  exit 1
fi

echo "P0_ORGANIZATION_ENSURE_PARALLEL_PASS tenant=$ORG1 memberships=1 organizations=1"
