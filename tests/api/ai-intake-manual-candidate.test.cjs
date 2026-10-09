'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createManualCandidateCas } = require('../../api/_ai_intake_manual_candidate.js');
const { _test: stateEndpoint } = require('../../api/ai-intake-state.js');
const { _test: rateLimitTest } = require('../../api/_rate_limit.js');

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174001';
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174002';
const CANDIDATE_ID = '123e4567-e89b-42d3-a456-426614174003';
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

test('manual correction adapter sends only field/value/CAS inputs to tenant-scoped RPC', async () => {
  const calls = [];
  const result = await createManualCandidateCas({
    sessionId: SESSION_ID,
    fieldKey: 'company',
    value: '  Acme Manual AD  ',
    expectedRevision: 9,
    requestId: REQUEST_ID
  }, {
    authorization: 'Bearer test-token',
    env: ENV,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return response({
        session_id: SESSION_ID,
        request_id: REQUEST_ID,
        revision: 11,
        candidate_id: CANDIDATE_ID,
        verification_state: 'unverified',
        can_generate_battery_passport: false,
        can_publish: false
      });
    }
  });

  assert.equal(result.candidate_id, CANDIDATE_ID);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /dpp_api_ai_intake_manual_candidate_cas$/);
  assert.deepEqual(Object.keys(calls[0].body).sort(), [
    'p_expected_revision','p_field_key','p_request_id','p_session_id','p_value'
  ]);
  assert.equal(calls[0].body.p_value, 'Acme Manual AD');
  assert.equal(calls[0].body.p_expected_revision, 9);
});

test('manual candidate validation rejects unsupported field, empty value and invalid revision before RPC', async () => {
  let calls = 0;
  const options = {
    authorization: 'Bearer test-token',
    env: ENV,
    fetchImpl: async () => { calls += 1; return response({}); }
  };

  await assert.rejects(createManualCandidateCas({
    sessionId: SESSION_ID, fieldKey: 'auto_publish', value: 'yes', expectedRevision: 1
  }, options), error => error?.code === 'AI_INTAKE_INVALID_MANUAL_CANDIDATE');
  await assert.rejects(createManualCandidateCas({
    sessionId: SESSION_ID, fieldKey: 'company', value: '   ', expectedRevision: 1
  }, options), error => error?.code === 'AI_INTAKE_INVALID_MANUAL_CANDIDATE');
  await assert.rejects(createManualCandidateCas({
    sessionId: SESSION_ID, fieldKey: 'company', value: 'Acme', expectedRevision: -1
  }, options), error => error?.code === 'AI_INTAKE_INVALID_MANUAL_CANDIDATE');
  assert.equal(calls, 0);
});

test('state manual_candidate action rejects identity, verification and publication injection', async () => {
  const forbidden = [
    ['tenant_id', '123e4567-e89b-42d3-a456-426614174099'],
    ['actor_id', '123e4567-e89b-42d3-a456-426614174098'],
    ['reviewer_id', '123e4567-e89b-42d3-a456-426614174097'],
    ['verified', true],
    ['auto_publish', true]
  ];
  for (const [key, value] of forbidden) {
    let calls = 0;
    const handler = stateEndpoint.createHandler({
      env: ENV,
      fetchImpl: async () => { calls += 1; return response({}); }
    });
    const out = res();
    await handler(req({
      action: 'manual_candidate',
      session_id: SESSION_ID,
      field_key: 'company',
      value: 'Acme Manual AD',
      expected_revision: 9,
      request_id: REQUEST_ID,
      [key]: value
    }), out);
    assert.equal(out.statusCode, 422, `${key} must be rejected`);
    assert.equal(calls, 0, `${key} must be rejected before RPC`);
  }
});

test('state manual_candidate action creates unverified candidate only', async () => {
  const calls = [];
  const handler = stateEndpoint.createHandler({
    env: ENV,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return response({
        session_id: SESSION_ID,
        revision: 11,
        candidate_id: CANDIDATE_ID,
        verification_state: 'unverified',
        canonical_answers_written: false,
        can_generate_battery_passport: false,
        can_publish: false
      });
    }
  });
  const out = res();
  await handler(req({
    action: 'manual_candidate',
    session_id: SESSION_ID,
    field_key: 'company',
    value: 'Acme Manual AD',
    expected_revision: 9,
    request_id: REQUEST_ID
  }), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(out.body.data.verification_state, 'unverified');
  assert.equal(out.body.data.canonical_answers_written, false);
  assert.equal(out.body.data.can_generate_battery_passport, false);
  assert.equal(out.body.data.can_publish, false);
});
