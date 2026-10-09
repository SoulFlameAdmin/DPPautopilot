'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _test: endpoint } = require('../../api/ai-intake.js');
const { _test: rateLimitTest } = require('../../api/_rate_limit.js');

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const SESSION_ID = '123e4567-e89b-42d3-a456-426614174001';
const ENV = {
  DPP_SUPABASE_URL: 'https://unit.supabase.co',
  DPP_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test',
  DPP_SHARED_RATE_LIMIT_ENABLED: 'false',
  AI_GATEWAY_API_KEY: 'test-gateway-key',
  AI_GATEWAY_MODEL: 'provider/test-model',
  AI_INTAKE_PERSISTENCE_ENABLED: 'true'
};

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

function req(body) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer valid-test-token' },
    body,
    socket: { remoteAddress: '127.0.0.1' }
  };
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

test('enabled one-prompt flow authenticates, extracts, resumes and persists in that order', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const href = String(url);
    calls.push({ href, options, body: options?.body ? JSON.parse(options.body) : null });

    if (href.endsWith('/auth/v1/user')) {
      return response({ id: USER_ID, email: 'user@example.test' });
    }
    if (href === 'https://ai-gateway.vercel.sh/v1/responses') {
      return response({
        output_text: JSON.stringify({
          candidates: [
            { key: 'country', value: 'Bulgaria', evidence: 'registered in Bulgaria' },
            { key: 'company', value: 'Acme Battery', evidence: 'Acme Battery' }
          ]
        })
      });
    }
    if (href.endsWith('/rest/v1/rpc/dpp_api_ai_intake_resume_or_create')) {
      return response({ id: SESSION_ID, status: 'active', revision: 3 });
    }
    if (href.endsWith('/rest/v1/rpc/dpp_api_ai_intake_turn_save')) {
      return response({
        session_id: SESSION_ID,
        saved_candidates: 2,
        verification_state: 'unverified',
        canonical_answers_written: false,
        can_publish: false
      });
    }
    throw new Error(`unexpected url: ${href}`);
  };

  const handler = endpoint.createHandler({ env: ENV, fetchImpl });
  const out = res();
  await handler(req({ prompt: 'Acme Battery is registered in Bulgaria.' }), out);

  assert.equal(out.statusCode, 200);
  assert.equal(calls.length, 4);
  assert.match(calls[0].href, /\/auth\/v1\/user$/);
  assert.equal(calls[1].href, 'https://ai-gateway.vercel.sh/v1/responses');
  assert.match(calls[2].href, /dpp_api_ai_intake_resume_or_create$/);
  assert.match(calls[3].href, /dpp_api_ai_intake_turn_save$/);
  assert.equal(calls[3].body.p_session_id, SESSION_ID);
  assert.deepEqual(calls[3].body.p_candidates.map(item => item.key), ['country','company']);
  assert.ok(calls[3].body.p_candidates.every(item => item.source_type === 'user'));
  assert.equal(out.body.data.persistence.enabled, true);
  assert.equal(out.body.data.persistence.session_id, SESSION_ID);
  assert.equal(out.body.data.persistence.verification_state, 'unverified');
  assert.equal(out.body.data.persistence.canonical_answers_written, false);
  assert.equal(out.body.data.persistence.can_publish, false);
  assert.equal(out.body.data.intake.can_publish, false);
});

test('when enabled persistence fails, endpoint fails closed instead of claiming saved state', async () => {
  const fetchImpl = async url => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) return response({ id: USER_ID });
    if (href === 'https://ai-gateway.vercel.sh/v1/responses') {
      return response({
        output_text: JSON.stringify({
          candidates: [{ key: 'company', value: 'Acme', evidence: 'Acme' }]
        })
      });
    }
    if (href.endsWith('/rest/v1/rpc/dpp_api_ai_intake_resume_or_create')) {
      return response({ message: 'migration not applied' }, 500);
    }
    throw new Error(`unexpected url: ${href}`);
  };

  const handler = endpoint.createHandler({ env: ENV, fetchImpl });
  const out = res();
  await handler(req({ prompt: 'Company is Acme.' }), out);

  assert.equal(out.statusCode, 502);
  assert.equal(out.body.error.code, 'AI_PERSISTENCE_ERROR');
  assert.equal(out.body.data, undefined);
});
