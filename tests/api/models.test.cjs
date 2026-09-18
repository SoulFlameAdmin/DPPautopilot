'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/models.js');

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value) { this.body = value || ''; }
  };
}

function makeReq(method, body, query, auth='Bearer test-token') {
  return {
    method,
    body,
    query: query || {},
    headers: auth ? { authorization: auth } : {}
  };
}

test('rejects missing bearer auth before any upstream call', async () => {
  const original = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not call'); };
  try {
    const res = makeRes();
    await handler(makeReq('GET', null, null, null), res);
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error.code, 'AUTH_REQUIRED');
    assert.equal(called, false);
  } finally {
    global.fetch = original;
  }
});

test('GET forwards user bearer token to tenant-scoped list RPC', async () => {
  const original = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  let seen;
  global.fetch = async (url, options) => {
    seen = { url, options };
    return { ok: true, async json() { return [{ id: '1', model_identifier: 'A' }]; } };
  };
  try {
    const res = makeRes();
    await handler(makeReq('GET'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(seen.url, 'https://example.supabase.co/rest/v1/rpc/dpp_api_models_list');
    assert.equal(seen.options.headers.Authorization, 'Bearer test-token');
    assert.equal(seen.options.headers.apikey, 'anon-key');
    assert.deepEqual(JSON.parse(seen.options.body), {});
    assert.equal(JSON.parse(res.body).data[0].model_identifier, 'A');
  } finally {
    global.fetch = original;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = oldKey;
  }
});

test('POST validates and forwards canonical model payload', async () => {
  const original = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co/';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  let seen;
  global.fetch = async (url, options) => {
    seen = { url, options };
    return {
      ok: true,
      async json() {
        return { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', model_identifier: 'MODEL-1' };
      }
    };
  };
  try {
    const res = makeRes();
    await handler(makeReq('POST', {
      model_identifier: '  MODEL-1  ',
      manufacturer_name: '  Maker  ',
      category: 'electric_vehicle',
      canonical_data: { capacityKwh: 82 }
    }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(seen.url, 'https://example.supabase.co/rest/v1/rpc/dpp_api_models_create');
    assert.deepEqual(JSON.parse(seen.options.body), {
      p_model_identifier: 'MODEL-1',
      p_manufacturer_name: 'Maker',
      p_category: 'electric_vehicle',
      p_canonical_data: { capacityKwh: 82 }
    });
  } finally {
    global.fetch = original;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = oldKey;
  }
});

test('PATCH rejects malformed model ids locally', async () => {
  const res = makeRes();
  await handler(makeReq('PATCH', { id: 'not-a-uuid', model_identifier: 'X' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error.code, 'INVALID_MODEL_ID');
});

test('database RBAC denial maps to stable 403 response', async () => {
  const original = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  global.fetch = async () => ({
    ok: false,
    async json() { return { code: 'DP104', message: 'active organization role is not authorized' }; }
  });
  try {
    const res = makeRes();
    await handler(makeReq('POST', {
      model_identifier: 'MODEL-1',
      manufacturer_name: 'Maker',
      category: 'portable',
      canonical_data: {}
    }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(JSON.parse(res.body).error.code, 'FORBIDDEN');
  } finally {
    global.fetch = original;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = oldKey;
  }
});

test('cross-tenant/not-found database response maps to 404 without detail leak', async () => {
  const original = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  global.fetch = async () => ({
    ok: false,
    async json() { return { code: 'DP205', message: 'internal detail should not be exposed' }; }
  });
  try {
    const res = makeRes();
    await handler(makeReq('DELETE', { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), res);
    const payload = JSON.parse(res.body);
    assert.equal(res.statusCode, 404);
    assert.equal(payload.error.code, 'MODEL_NOT_FOUND');
    assert.equal(res.body.includes('internal detail should not be exposed'), false);
  } finally {
    global.fetch = original;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = oldKey;
  }
});

test('unsupported methods return 405 with Allow header', async () => {
  const res = makeRes();
  await handler(makeReq('PUT', {}), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST, PATCH, DELETE');
});
