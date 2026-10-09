'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _test: endpoint } = require('../../api/ai-intake.js');
const { _test: rateLimitTest } = require('../../api/_rate_limit.js');

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const BASE_ENV = {
  DPP_SUPABASE_URL: 'https://unit.supabase.co',
  DPP_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test',
  DPP_SHARED_RATE_LIMIT_ENABLED: 'false',
  AI_GATEWAY_API_KEY: 'test-gateway-key',
  AI_GATEWAY_MODEL: 'provider/test-model'
};

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

function gatewayPayload(candidates) {
  return {
    output_text: JSON.stringify({ candidates })
  };
}

test.beforeEach(() => rateLimitTest.resetForTests());

test('missing bearer is rejected before auth or AI network calls', async () => {
  let calls = 0;
  const handler = endpoint.createHandler({
    env: BASE_ENV,
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); }
  });
  const res = mockRes();
  await handler(mockReq({ authorization: '', body: { prompt: 'We make batteries.' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  assert.equal(calls, 0);
});

test('invalid or expired Supabase token is rejected before spending AI credits', async () => {
  const urls = [];
  const handler = endpoint.createHandler({
    env: BASE_ENV,
    fetchImpl: async url => {
      urls.push(String(url));
      return response({ message: 'invalid jwt' }, 401);
    }
  });
  const res = mockRes();
  await handler(mockReq({ body: { prompt: 'We make batteries.' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'AUTH_INVALID');
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/auth\/v1\/user$/);
  assert.ok(!urls.some(url => url.includes('ai-gateway.vercel.sh')));
});

test('unknown request fields are rejected before auth and AI', async () => {
  let calls = 0;
  const handler = endpoint.createHandler({
    env: BASE_ENV,
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); }
  });
  const res = mockRes();
  await handler(mockReq({ body: { prompt: 'We make batteries.', auto_publish: true } }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.equal(calls, 0);
});

test('valid auth but missing AI credentials fails closed without publishing or persistence', async () => {
  const env = { ...BASE_ENV };
  delete env.AI_GATEWAY_API_KEY;
  let calls = 0;
  const handler = endpoint.createHandler({
    env,
    fetchImpl: async url => {
      calls += 1;
      assert.match(String(url), /\/auth\/v1\/user$/);
      return response({ id: USER_ID, email: 'user@example.test' });
    }
  });
  const res = mockRes();
  await handler(mockReq({ body: { prompt: 'We make batteries.' } }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'AI_NOT_CONFIGURED');
  assert.equal(calls, 1);
});

test('one prompt returns only unverified candidates plus deterministic follow-up questions', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, 'Bearer valid-test-token');
      assert.equal(options.headers.apikey, BASE_ENV.DPP_SUPABASE_PUBLISHABLE_KEY);
      return response({ id: USER_ID, email: 'user@example.test' });
    }
    if (String(url) === 'https://ai-gateway.vercel.sh/v1/responses') {
      assert.equal(options.headers.Authorization, 'Bearer test-gateway-key');
      return response(gatewayPayload([
        { key: 'country', value: 'Bulgaria', evidence: 'registered in Bulgaria' },
        { key: 'company', value: 'Acme Battery', evidence: 'Acme Battery' },
        { key: 'products', value: 'e-bike battery packs', evidence: 'e-bike battery packs' }
      ]));
    }
    throw new Error(`unexpected url: ${url}`);
  };

  const handler = endpoint.createHandler({ env: BASE_ENV, fetchImpl });
  const res = mockRes();
  await handler(mockReq({
    body: { prompt: 'Acme Battery is registered in Bulgaria and makes e-bike battery packs.' }
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(res.body.data.candidates.map(item => item.key), ['country', 'company', 'products']);
  assert.equal(res.body.data.intake.status, 'collecting');
  assert.equal(res.body.data.intake.can_generate, false);
  assert.equal(res.body.data.intake.can_publish, false);
  assert.deepEqual(res.body.data.intake.unverified_fields, ['country', 'company', 'products']);
  assert.ok(res.body.data.intake.missing_fields.includes('systems'));
  assert.match(res.body.data.notice, /unverified/i);
});

test('non-POST methods never reach authentication or AI', async () => {
  let calls = 0;
  const handler = endpoint.createHandler({
    env: BASE_ENV,
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); }
  });
  const res = mockRes();
  await handler(mockReq({ method: 'GET', body: {} }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.equal(calls, 0);
});
