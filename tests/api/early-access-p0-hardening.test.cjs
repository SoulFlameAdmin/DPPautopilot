'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migrations=fs.readdirSync(path.join(root,'supabase/migrations'))
  .filter(name=>name.endsWith('.sql'))
  .map(name=>read(path.join('supabase/migrations',name)))
  .join('\n');

const early=read('assets/csp/manufacturer-early.js');

test('early access uses a server-idempotent organization ensure RPC',()=>{
  assert.match(early,/dpp_api_organization_ensure/);
  assert.doesNotMatch(early,/organizationRpc\("dpp_api_organization_create"/);
  assert.match(migrations,/create or replace function public\.dpp_api_organization_ensure/);
  assert.match(migrations,/pg_advisory_xact_lock/);
  assert.match(migrations,/dpp_organization_members/);
  assert.match(migrations,/dpp_set_active_organization/);
});

test('existing single membership can be activated instead of dead-ending onboarding',()=>{
  assert.match(migrations,/dpp_api_organization_ensure/);
  assert.match(migrations,/active_organization_id|dpp_set_active_organization/);
  assert.doesNotMatch(early,/throw new Error\("Има фирмен tenant, но няма активен workspace\."\)/);
});

test('manufacturer early access refreshes an expired Google session and retries once',()=>{
  assert.match(early,/grant_type=refresh_token/);
  assert.match(early,/refresh_token/);
  assert.match(early,/status===401/);
  assert.match(early,/retry/);
  assert.match(early,/dpp_google_session_v1/);
});

test('organization ensure RPC is authenticated-only',()=>{
  assert.match(migrations,/revoke all on function public\.dpp_api_organization_ensure[^;]*from public,anon/);
  assert.match(migrations,/grant execute on function public\.dpp_api_organization_ensure[^;]*to authenticated/);
});
