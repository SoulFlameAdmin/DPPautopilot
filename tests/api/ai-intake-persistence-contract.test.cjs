'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'supabase/migrations/20261009222500_dpp_ai_intake_persistence_v1.sql');
const hardeningPath = path.join(root, 'supabase/migrations/20261009222600_dpp_ai_intake_persistence_v1_hardening.sql');
const casPath = path.join(root, 'supabase/migrations/20261009222700_dpp_ai_conversation_cas_v2.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const hardening = fs.readFileSync(hardeningPath, 'utf8');
const cas = fs.readFileSync(casPath, 'utf8');
const combined = `${sql}\n${hardening}\n${cas}`;

const tables = [
  'dpp_ai_intake_sessions',
  'dpp_ai_intake_messages',
  'dpp_ai_intake_candidates',
  'dpp_ai_intake_approvals',
  'dpp_ai_intake_requests',
  'dpp_ai_intake_events'
];
const baseTables = tables.slice(0, 4);
const casTables = tables.slice(4);
const fields = ['country','company','products','sku','annualVolume','users','systems','automation'];

test('A2 persistence separates session, conversation, candidates, approvals, idempotency and events', () => {
  for (const table of baseTables) {
    assert.match(combined, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    assert.match(combined, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(combined, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  for (const table of casTables) {
    assert.match(cas, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    assert.match(cas, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(cas, new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated`, 'i'));
  }
  assert.match(combined, /candidate_id uuid not null/i);
  assert.match(combined, /approved_by uuid not null/i);
  assert.match(combined, /request_sha256 text not null/i);
  assert.match(combined, /payload_sha256 text not null/i);
});

test('A2 exact onboarding field contract is fixed to the existing eight keys', () => {
  for (const key of fields) assert.ok(combined.includes(`'${key}'`), `missing field ${key}`);
  assert.doesNotMatch(combined, /field_key\s+text[^;]*freeform/i);
});

test('A2 child records are tenant/session-bound and approvals bind exact candidate identity', () => {
  assert.match(combined, /foreign key \(organization_id, session_id\)[\s\S]*references public\.dpp_ai_intake_sessions\(organization_id, id\)/i);
  assert.match(hardening, /unique \(organization_id, session_id, field_key, id\)/i);
  assert.match(hardening, /foreign key \(organization_id, session_id, field_key, candidate_id\)[\s\S]*references public\.dpp_ai_intake_candidates\(organization_id, session_id, field_key, id\)/i);
  assert.match(cas, /foreign key \(organization_id, session_id, request_id\)[\s\S]*references public\.dpp_ai_intake_requests\(organization_id, session_id, request_id\)/i);
});

test('Worker A conflicts are representable: one-field candidate uniqueness is removed', () => {
  assert.match(cas, /drop constraint if exists dpp_ai_intake_candidates_organization_id_session_id_field_key_k/i);
  assert.match(cas, /order by c\.created_at,c\.id/i);
  assert.match(cas, /count\(distinct public\.dpp_ai_canonical_text\(c\.candidate_value\)\)>1/i);
});

test('A2 CAS uses server authority for tenant, actor, timestamps and event IDs', () => {
  assert.match(cas, /v_org:=public\.dpp_require_active_role\(array\['owner','admin','editor'\]\)/i);
  assert.match(cas, /v_user:=public\.dpp_request_user_id\(\)/i);
  assert.match(cas, /v_event_id:=gen_random_uuid\(\)/i);
  assert.match(cas, /v_event_time:=clock_timestamp\(\)/i);
  assert.match(cas, /'candidate\.review',v_user/i);
  assert.match(cas, /'session\.approve',v_user/i);
  assert.doesNotMatch(cas, /p_actor_id\s+uuid/i);
  assert.doesNotMatch(cas, /p_tenant_id\s+uuid/i);
  assert.doesNotMatch(cas, /p_reviewer_id\s+uuid/i);
  assert.doesNotMatch(cas, /p_occurred_at\s+timestamptz/i);
});

test('A2 CAS is atomic, revision-checked and exact requests are idempotent', () => {
  assert.match(cas, /for update/i);
  assert.match(cas, /v_session\.revision<>p_expected_revision/i);
  assert.match(cas, /request_id uuid not null/i);
  assert.match(cas, /request_sha256=v_request_hash/i);
  assert.match(cas, /'idempotent_retry',true/i);
  assert.match(cas, /raise exception 'AI request id was reused with different content' using errcode='DP409'/i);
  assert.match(cas, /revision integer not null check \(revision = expected_revision \+ 1\)/i);
  assert.match(cas, /extensions\.digest[\s\S]*'sha256'/i);
});

test('review permissions are server-side and final approval is owner/admin-only', () => {
  assert.match(cas, /dpp_api_ai_intake_candidate_review_cas[\s\S]*dpp_require_active_role\(array\['owner','admin','editor'\]\)/i);
  assert.match(cas, /dpp_api_ai_intake_session_approve_cas[\s\S]*dpp_require_active_role\(array\['owner','admin'\]\)/i);
  assert.match(cas, /Conflicting candidate must be rejected before verification/i);
  assert.match(cas, /All eight onboarding fields require human verification/i);
});

test('A2 uses hardened security-definer RPCs and viewer snapshot only', () => {
  const rpcs = [
    'dpp_api_ai_intake_resume_or_create',
    'dpp_api_ai_intake_turn_save_cas',
    'dpp_api_ai_intake_candidate_review_cas',
    'dpp_api_ai_intake_session_approve_cas',
    'dpp_api_ai_intake_snapshot'
  ];
  for (const rpc of rpcs) assert.match(combined, new RegExp(`create or replace function public\\.${rpc}`, 'i'));
  assert.match(combined, /dpp_require_active_role\(array\['owner','admin','editor','viewer'\]\)/i);
  assert.match(combined, /security definer[\s\S]*set search_path=/i);
  assert.match(combined, /revoke all on function public\.dpp_api_ai_intake_snapshot\(uuid\) from public,anon/i);
});

test('AI candidates remain unverified until server-authorized human review', () => {
  assert.match(sql, /verification_state text not null default 'unverified'/i);
  assert.match(cas, /'unverified'/i);
  assert.match(cas, /verification_state=case when p_accept then 'accepted' else 'rejected' end/i);
  assert.match(cas, /reviewed_by=v_user/i);
  assert.match(cas, /'can_publish',false/i);
});

test('A2/A2.1 writes only AI intake persistence, never canonical DPP/product/passport tables', () => {
  const writeTargets = [...combined.matchAll(/(?:insert\s+into|update|delete\s+from)\s+public\.([a-z0-9_]+)/gi)].map(m => m[1]);
  const allowed = new Set(tables);
  for (const target of writeTargets) assert.ok(allowed.has(target), `unexpected A2 write target: ${target}`);
  assert.doesNotMatch(combined, /insert\s+into\s+public\.dpp_manufacturer_onboarding_answers/i);
  assert.doesNotMatch(combined, /insert\s+into\s+public\.dpp_battery_models/i);
  assert.doesNotMatch(combined, /insert\s+into\s+public\.dpp_battery_items/i);
  assert.doesNotMatch(combined, /insert\s+into\s+public\.dpp_passports/i);
});

test('A2 remains proposal-only while C04 is a release blocker', () => {
  assert.match(sql, /PROPOSAL ONLY while the Stage 1 C04 live migration gate is RED/i);
  assert.match(cas, /PROPOSAL ONLY while Stage 1 C04 is RED/i);
});
