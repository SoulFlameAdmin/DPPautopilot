'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _test: endpoint } = require('../../api/ai-intake-state.js');
const { _test: rateLimitTest } = require('../../api/_rate_limit.js');

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174001';
const CANDIDATE_ID = '123e4567-e89b-42d3-a456-426614174002';
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174003';
const ENV = {
  DPP_SUPABASE_URL: 'https://unit.supabase.co',
  DPP_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test',
  DPP_SHARED_RATE_LIMIT_ENABLED: 'false',
  AI_INTAKE_PERSISTENCE_ENABLED: 'true'
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}
function req(body) {
  return { method: 'POST', headers: { authorization: 'Bearer test-token' }, body, socket: { remoteAddress: '127.0.0.1' } };
}
function res() {
  let raw = '';
  return {
    statusCode: 200,
    setHeader() {},
    end(chunk = '') { raw += String(chunk || ''); },
    get body() { return raw ? JSON.parse(raw) : null; }
  };
}

test.beforeEach(() => rateLimitTest.resetForTests());

test('review_cas accepts only candidate decision + revision/idempotency fields', async () => {
  const calls = [];
  const handler = endpoint.createHandler({
    env: ENV,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return response({
        session_id: SESSION_ID,
        candidate_id: CANDIDATE_ID,
        verification_state: 'accepted',
        revision: 12,
        can_publish: false
      });
    }
  });

  const out = res();
  await handler(req({
    action: 'review_cas',
    session_id: SESSION_ID,
    candidate_id: CANDIDATE_ID,
    accept: true,
    expected_revision: 11,
    request_id: REQUEST_ID
  }), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /dpp_api_ai_intake_candidate_review_cas$/);
  assert.deepEqual(Object.keys(calls[0].body).sort(), [
    'p_accept','p_candidate_id','p_expected_revision','p_request_id','p_session_id'
  ]);
  assert.equal(calls[0].body.p_expected_revision, 11);
  assert.equal(out.body.data.can_publish, false);
});

test('client cannot inject tenant actor reviewer time or publish controls into CAS review', async () => {
  const forbidden = [
    ['tenant_id', '123e4567-e89b-42d3-a456-426614174099'],
    ['actor_id', '123e4567-e89b-42d3-a456-426614174098'],
    ['reviewer_id', '123e4567-e89b-42d3-a456-426614174097'],
    ['occurred_at', '2026-10-09T19:00:00Z'],
    ['auto_publish', true]
  ];
  for (const [key, value] of forbidden) {
    let calls = 0;
    const handler = endpoint.createHandler({
      env: ENV,
      fetchImpl: async () => { calls += 1; return response({}); }
    });
    const out = res();
    await handler(req({
      action: 'review_cas', session_id: SESSION_ID, candidate_id: CANDIDATE_ID,
      accept: true, expected_revision: 11, request_id: REQUEST_ID, [key]: value
    }), out);
    assert.equal(out.statusCode, 422, `${key} must be rejected`);
    assert.equal(calls, 0, `${key} must be rejected before RPC`);
  }
});

test('final approve action contains no reviewer identity and maps only to owner/admin DB gate', async () => {
  const calls = [];
  const handler = endpoint.createHandler({
    env: ENV,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return response({
        session_id: SESSION_ID,
        revision: 20,
        can_generate_onboarding_configuration: true,
        can_generate_battery_passport: false,
        can_publish: false
      });
    }
  });
  const out = res();
  await handler(req({ action: 'approve', session_id: SESSION_ID, expected_revision: 19, request_id: REQUEST_ID }), out);
  assert.equal(out.statusCode, 200);
  assert.match(calls[0].url, /dpp_api_ai_intake_session_approve_cas$/);
  assert.deepEqual(Object.keys(calls[0].body).sort(), [
    'p_expected_revision','p_request_id','p_session_id'
  ]);
  assert.equal(out.body.data.can_generate_onboarding_configuration, true);
  assert.equal(out.body.data.can_generate_battery_passport, false);
  assert.equal(out.body.data.can_publish, false);
});

test('state endpoint exposes no publish or battery-passport action', () => {
  for (const action of ['publish','generate_passport','activate','ready']) {
    assert.equal(endpoint.validateBody({ action }), 'action');
  }
});
