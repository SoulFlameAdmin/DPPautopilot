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
    await handler(makeReq('DELETE', {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expected_updated_at: '2026-09-20T00:00:00.000Z'
    }), res);
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


test('PATCH requires expected_updated_at before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      model_identifier:'MODEL-2'
    }),res);
    assert.equal(res.statusCode,428);
    assert.equal(JSON.parse(res.body).error.code,'WRITE_PRECONDITION_REQUIRED');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('PATCH forwards optimistic concurrency token to checked model RPC', async () => {
  const original=global.fetch;
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',model_identifier:'MODEL-2'};}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      model_identifier:'MODEL-2',
      expected_updated_at:'2026-09-19T04:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_models_update_checked');
    assert.equal(JSON.parse(seen.options.body).p_expected_updated_at,'2026-09-19T04:00:00.000Z');
  } finally {
    global.fetch=original;
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  }
});

test('stale model write maps DP206 to stable 409', async () => {
  const original=global.fetch;
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  global.fetch=async()=>({ok:false,async json(){return {code:'DP206',message:'internal stale timestamp'};}});
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      model_identifier:'MODEL-2',
      expected_updated_at:'2026-09-19T04:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'STALE_WRITE');
    assert.equal(res.body.includes('internal stale timestamp'),false);
  } finally {
    global.fetch=original;
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  }
});


test('DELETE requires expected_updated_at before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('DELETE',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    }),res);
    assert.equal(res.statusCode,428);
    assert.equal(JSON.parse(res.body).error.code,'WRITE_PRECONDITION_REQUIRED');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('DELETE forwards optimistic concurrency token to checked model delete RPC', async () => {
  const original=global.fetch;
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('DELETE',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expected_updated_at:'2026-09-20T00:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_models_delete_checked');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_expected_updated_at:'2026-09-20T00:00:00.000Z'
    });
  } finally {
    global.fetch=original;
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  }
});

test('stale model delete maps DP206 to stable 409', async () => {
  const original=global.fetch;
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  global.fetch=async()=>({ok:false,async json(){return {code:'DP206',message:'internal stale delete timestamp'};}});
  try {
    const res=makeRes();
    await handler(makeReq('DELETE',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expected_updated_at:'2026-09-20T00:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'STALE_WRITE');
    assert.equal(res.body.includes('internal stale delete timestamp'),false);
  } finally {
    global.fetch=original;
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  }
});


test('M17 model RPC network failure maps to stable 502 without leaking transport detail',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_models_list',{},'Bearer model-token',env,async()=>{throw new Error('socket reset private transport detail');},50),
    error=>{
      assert.equal(error.status,502);
      assert.equal(error.publicCode,'UPSTREAM_ERROR');
      assert.equal(error.publicMessage,'Database request failed.');
      assert.equal(String(error).includes('private transport detail'),false);
      return true;
    }
  );
});

test('M17 model RPC times out while upstream response body stalls', async () => {
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async(_url,options)=>({
    ok:true,
    json:()=>new Promise((_resolve,reject)=>{
      options.signal.addEventListener('abort',()=>{
        const error=new Error('aborted body');
        error.name='AbortError';
        reject(error);
      },{once:true});
    })
  });
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_models_list',{},'Bearer test-token',env,fetchImpl,5),
    error=>{
      assert.equal(error.status,504);
      assert.equal(error.publicCode,'UPSTREAM_TIMEOUT');
      assert.equal(error.publicMessage,'Database request timed out.');
      return true;
    }
  );
});

test('M17 model RPC rejects malformed successful upstream JSON', async () => {
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async()=>({
    ok:true,
    async json(){throw new SyntaxError('malformed upstream json');}
  });
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_models_list',{},'Bearer test-token',env,fetchImpl,50),
    error=>{
      assert.equal(error.status,502);
      assert.equal(error.publicCode,'UPSTREAM_ERROR');
      assert.equal(error.publicMessage,'Database request failed.');
      assert.equal(String(error).includes('malformed upstream json'),false);
      return true;
    }
  );
});
