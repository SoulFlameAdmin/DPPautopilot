'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'supabase/migrations/20261009222500_dpp_ai_intake_persistence_v1.sql');
const hardeningPath = path.join(root, 'supabase/migrations/20261009222600_dpp_ai_intake_persistence_v1_hardening.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const hardening = fs.readFileSync(hardeningPath, 'utf8');
const combined = `${sql}\n${hardening}`;

const tables = [
  'dpp_ai_intake_sessions',
  'dpp_ai_intake_messages',
  'dpp_ai_intake_candidates',
  'dpp_ai_intake_approvals'
];

const fields = ['country','company','products','sku','annualVolume','users','systems','automation'];

test('A2 persistence has separate session, conversation, candidate and human approval records', () => {
  for (const table of tables) {
    assert.match(combined, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    assert.match(combined, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(combined, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.match(combined, /candidate_id uuid not null/i);
  assert.match(combined, /approved_by uuid not null/i);
  assert.match(combined, /approved_value text not null/i);
});

test('A2 exact onboarding field contract is fixed to the existing eight keys', () => {
  for (const key of fields) assert.ok(combined.includes(`'${key}'`), `missing field ${key}`);
  assert.doesNotMatch(combined, /field_key\s+text[^;]*freeform/i);
});

test('A2 child records are bound to tenant and session, approvals also bind exact candidate identity', () => {
  assert.match(combined, /foreign key \(organization_id, session_id\)[\s\S]*references public\.dpp_ai_intake_sessions\(organization_id, id\)/i);
  assert.match(hardening, /unique \(organization_id, session_id, field_key, id\)/i);
  assert.match(hardening, /foreign key \(organization_id, session_id, field_key, candidate_id\)[\s\S]*references public\.dpp_ai_intake_candidates\(organization_id, session_id, field_key, id\)/i);
});

test('A2 uses existing tenant RBAC and hardened security-definer RPCs', () => {
  const rpcs = [
    'dpp_api_ai_intake_resume_or_create',
    'dpp_api_ai_intake_turn_save',
    'dpp_api_ai_intake_candidate_review',
    'dpp_api_ai_intake_snapshot'
  ];
  for (const rpc of rpcs) {
    assert.match(combined, new RegExp(`create or replace function public\\.${rpc}`, 'i'));
  }
  assert.match(combined, /dpp_require_active_role\(array\['owner','admin','editor'\]\)/i);
  assert.match(combined, /dpp_require_active_role\(array\['owner','admin','editor','viewer'\]\)/i);
  assert.match(combined, /security definer[\s\S]*set search_path=public,pg_temp/i);
  assert.match(combined, /revoke all on function public\.dpp_api_ai_intake_snapshot\(uuid\) from public,anon/i);
});

test('AI candidates are persisted unverified and cannot silently become verified facts', () => {
  assert.match(sql, /verification_state text not null default 'unverified'/i);
  assert.match(sql, /verification_state='unverified'/i);
  assert.match(sql, /'canonical_answers_written',false/i);
  assert.match(sql, /'can_publish',false/i);
  assert.match(sql, /insert into public\.dpp_ai_intake_approvals/i);
  assert.match(sql, /verification_state=v_state/i);
});

test('A2 proposal has no canonical onboarding, product, passport, activation or publication writes', () => {
  const writeTargets = [...combined.matchAll(/(?:insert\s+into|update|delete\s+from)\s+public\.([a-z0-9_]+)/gi)].map(m => m[1]);
  const allowed = new Set(tables);
  for (const target of writeTargets) {
    assert.ok(allowed.has(target), `unexpected A2 write target: ${target}`);
  }
  assert.doesNotMatch(combined, /insert\s+into\s+public\.dpp_manufacturer_onboarding_answers/i);
  assert.doesNotMatch(combined, /insert\s+into\s+public\.dpp_battery_models/i);
  assert.doesNotMatch(combined, /insert\s+into\s+public\.dpp_battery_items/i);
  assert.doesNotMatch(combined, /insert\s+into\s+public\.dpp_passports/i);
});

test('A2 is explicitly proposal-only while C04 remains a release blocker', () => {
  assert.match(sql, /PROPOSAL ONLY while the Stage 1 C04 live migration gate is RED/i);
});
