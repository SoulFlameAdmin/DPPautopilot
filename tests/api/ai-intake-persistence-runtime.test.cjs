'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const persistence = require('../../api/_ai_intake_persistence.js');
const { _test: stateEndpoint } = require('../../api/ai-intake-state.js');
const { _test: rateLimitTest } = require('../../api/_rate_limit.js');

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174001';
const BASE_ENV = {
  DPP_SUPABASE_URL: 'https://unit.supabase.co',
  DPP_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test',
  DPP_SHARED_RATE_LIMIT_ENABLED: 'false'
};
const ENABLED_ENV = { ...BASE_ENV, AI_INTAKE_PERSISTENCE_ENABLED: 'true' };

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

function mockReq({ method = 'POST', authorization = 'Bearer valid-test-token', body = {} } = {}) {
  return {
    method,
    headers: authorization ? { authorization } : {},
    body,
    socket: { remoteAddress: '127.0.0.1' }
  };
}

function mockRes() {
  const headers = {};
  let raw = '';
  return {
    statusCode: 200,
    headers,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    end(chunk = '') { raw += String(chunk || ''); },
    get body() { return raw ? JSON.parse(raw) : null; }
  };
}

test.beforeEach(() => rateLimitTest.resetForTests());

test('persistence is disabled by default and performs zero database calls', async () => {
  let calls = 0;
  const result = await persistence.persistExtractedTurn({
    authorization: 'Bearer valid-test-token',
    prompt: 'Acme Battery is in Bulgaria.',
    candidates: [{ key: 'country', value: 'Bulgaria', evidence: 'in Bulgaria' }],
    model: 'openai/gpt-5.6-sol',
    env: BASE_ENV,
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); }
  });
  assert.deepEqual(result, { enabled: false });
  assert.equal(calls, 0);
});

test('enabled persistence resumes session then atomically stores user prompt and unverified candidates', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options, body: JSON.parse(options.body) });
    assert.equal(options.headers.Authorization, 'Bearer valid-test-token');
    assert.equal(options.headers.apikey, BASE_ENV.DPP_SUPABASE_PUBLISHABLE_KEY);
    if (String(url).endsWith('/rest/v1/rpc/dpp_api_ai_intake_resume_or_create')) {
      return response({
        id: SESSION_ID,
        organization_id: '123e4567-e89b-42d3-a456-426614174002',
        created_by: '123e4567-e89b-42d3-a456-426614174003',
        status: 'active',
        revision: 1
      });
    }
    if (String(url).endsWith('/rest/v1/rpc/dpp_api_ai_intake_turn_save')) {
      return response({
        session_id: SESSION_ID,
        saved_candidates: 2,
        verification_state: 'unverified',
        canonical_answers_written: false,
        can_publish: false
      });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const result = await persistence.persistExtractedTurn({
    authorization: 'Bearer valid-test-token',
    prompt: 'Acme Battery is registered in Bulgaria.',
    candidates: [
      { key: 'country', value: 'Bulgaria', evidence: 'registered in Bulgaria' },
      { key: 'company', value: 'Acme Battery', evidence: 'Acme Battery' }
    ],
    model: 'openai/gpt-5.6-sol',
    sourceRef: 'conversation:prompt',
    env: ENABLED_ENV,
    fetchImpl
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.p_session_id, SESSION_ID);
  assert.equal(calls[1].body.p_model_id, 'openai/gpt-5.6-sol');
  assert.equal(calls[1].body.p_candidates[0].source_type, 'user');
  assert.equal(calls[1].body.p_candidates[0].source_ref, 'conversation:prompt');
  assert.equal(result.enabled, true);
  assert.equal(result.session_id, SESSION_ID);
  assert.equal(result.verification_state, 'unverified');
  assert.equal(result.canonical_answers_written, false);
  assert.equal(result.can_publish, false);
});

test('duplicate or unsupported model candidates are rejected before database persistence', () => {
  assert.throws(() => persistence.normalizeCandidates([
    { key: 'company', value: 'A', evidence: 'A' },
    { key: 'company', value: 'B', evidence: 'B' }
  ], 'conversation:prompt'), error => error?.code === 'AI_PERSISTENCE_INVALID_CANDIDATES');

  assert.throws(() => persistence.normalizeCandidates([
    { key: 'auto_publish', value: 'true', evidence: 'publish it' }
  ], 'conversation:prompt'), error => error?.code === 'AI_PERSISTENCE_INVALID_CANDIDATES');
});

test('state API is unavailable while the persistence migration feature gate is off', async () => {
  let calls = 0;
  const handler = stateEndpoint.createHandler({
    env: BASE_ENV,
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); }
  });
  const res = mockRes();
  await handler(mockReq({ body: { action: 'resume' } }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'AI_PERSISTENCE_NOT_ENABLED');
  assert.equal(calls, 0);
});

test('state API resume uses only the tenant-scoped resume RPC when enabled', async () => {
  const calls = [];
  const handler = stateEndpoint.createHandler({
    env: ENABLED_ENV,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body), options });
      assert.equal(options.headers.Authorization, 'Bearer valid-test-token');
      assert.match(String(url), /\/rest\/v1\/rpc\/dpp_api_ai_intake_resume_or_create$/);
      return response({ id: SESSION_ID, status: 'active', revision: 1 });
    }
  });
  const res = mockRes();
  await handler(mockReq({ body: { action: 'resume' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.id, SESSION_ID);
  assert.equal(calls.length, 1);
});

test('state API review sends explicit human decision and never accepts publish controls', async () => {
  const calls = [];
  const handler = stateEndpoint.createHandler({
    env: ENABLED_ENV,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return response({
        session_id: SESSION_ID,
        field_key: 'company',
        verification_state: 'accepted',
        approved_value: 'Acme Battery Ltd',
        canonical_answers_written: false,
        can_publish: false
      });
    }
  });

  const res = mockRes();
  await handler(mockReq({ body: {
    action: 'review',
    session_id: SESSION_ID,
    field_key: 'company',
    approved_value: 'Acme Battery Ltd',
    accept: true
  } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/dpp_api_ai_intake_candidate_review$/);
  assert.equal(calls[0].body.p_accept, true);
  assert.equal(calls[0].body.p_approved_value, 'Acme Battery Ltd');
  assert.equal(res.body.data.canonical_answers_written, false);
  assert.equal(res.body.data.can_publish, false);

  const bad = mockRes();
  await handler(mockReq({ body: {
    action: 'review',
    session_id: SESSION_ID,
    field_key: 'company',
    approved_value: 'Acme Battery Ltd',
    accept: true,
    auto_publish: true
  } }), bad);
  assert.equal(bad.statusCode, 422);
  assert.equal(calls.length, 1);
});
