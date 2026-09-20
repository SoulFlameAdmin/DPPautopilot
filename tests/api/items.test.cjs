'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/items.js');

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
  return { method, body, query: query || {}, headers: auth ? { authorization: auth } : {} };
}
function withEnv() {
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return () => {
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}

test('missing bearer auth is rejected before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('GET',null,null,null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('GET forwards caller token to tenant-scoped list RPC', async () => {
  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return [{id:'1',unique_identifier:'urn:dpp:item:1'}];}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('GET'),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_items_list');
    assert.equal(seen.options.headers.Authorization,'Bearer test-token');
    assert.equal(JSON.parse(res.body).data[0].unique_identifier,'urn:dpp:item:1');
  } finally { global.fetch=original; restore(); }
});

test('POST validates and forwards item payload', async () => {
  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',unique_identifier:'urn:dpp:item:1'};}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('POST',{
      model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      unique_identifier:'  urn:dpp:item:1  ',
      lifecycle_status:'original',
      canonical_data:{serial:'S1'}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_items_create');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_unique_identifier:'urn:dpp:item:1',
      p_lifecycle_status:'original',
      p_canonical_data:{serial:'S1'}
    });
  } finally { global.fetch=original; restore(); }
});

test('POST rejects malformed model linkage locally', async () => {
  const res=makeRes();
  await handler(makeReq('POST',{
    model_id:'not-a-uuid',
    unique_identifier:'urn:dpp:item:1',
    lifecycle_status:'original',
    canonical_data:{}
  }),res);
  assert.equal(res.statusCode,422);
  assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
});

test('PATCH rejects malformed item id locally', async () => {
  const res=makeRes();
  await handler(makeReq('PATCH',{id:'bad',lifecycle_status:'second_life'}),res);
  assert.equal(res.statusCode,400);
  assert.equal(JSON.parse(res.body).error.code,'INVALID_ITEM_ID');
});

test('lifecycle transition rejection maps to stable conflict', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP307',message:'internal transition detail'};}});
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lifecycle_status:'original',
      expected_updated_at:'2026-09-19T04:00:00.000Z'
    }),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,409);
    assert.equal(payload.error.code,'LIFECYCLE_CONFLICT');
    assert.equal(res.body.includes('internal transition detail'),false);
  } finally { global.fetch=original; restore(); }
});

test('passport-protected delete maps to stable conflict', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP308',message:'do not leak'};}});
  try {
    const res=makeRes();
    await handler(makeReq('DELETE',{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expected_updated_at:'2026-09-20T00:00:00.000Z'}),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'ITEM_HAS_PASSPORT');
  } finally { global.fetch=original; restore(); }
});

test('cross-tenant item not-found maps to 404 without detail leak', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP306',message:'internal detail'};}});
  try {
    const res=makeRes();
    await handler(makeReq('DELETE',{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expected_updated_at:'2026-09-20T00:00:00.000Z'}),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,404);
    assert.equal(payload.error.code,'ITEM_NOT_FOUND');
    assert.equal(res.body.includes('internal detail'),false);
  } finally { global.fetch=original; restore(); }
});

test('viewer/RBAC denial maps to 403', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP104'};}});
  try {
    const res=makeRes();
    await handler(makeReq('POST',{
      model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      unique_identifier:'urn:dpp:item:1',
      category:'ignored',
      lifecycle_status:'original',
      canonical_data:{}
    }),res);
    assert.equal(res.statusCode,403);
    assert.equal(JSON.parse(res.body).error.code,'FORBIDDEN');
  } finally { global.fetch=original; restore(); }
});

test('unsupported methods return 405 with Allow header', async () => {
  const res=makeRes();
  await handler(makeReq('PUT',{}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET, POST, PATCH, DELETE');
});


test('PATCH requires expected_updated_at before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lifecycle_status:'repurposed'
    }),res);
    assert.equal(res.statusCode,428);
    assert.equal(JSON.parse(res.body).error.code,'WRITE_PRECONDITION_REQUIRED');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('PATCH forwards optimistic concurrency token to checked item RPC', async () => {
  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',lifecycle_status:'repurposed'};}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lifecycle_status:'repurposed',
      expected_updated_at:'2026-09-19T04:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_items_update_checked');
    assert.equal(JSON.parse(seen.options.body).p_expected_updated_at,'2026-09-19T04:00:00.000Z');
  } finally { global.fetch=original; restore(); }
});

test('stale item write maps DP309 to stable 409', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP309',message:'internal stale timestamp'};}});
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lifecycle_status:'repurposed',
      expected_updated_at:'2026-09-19T04:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'STALE_WRITE');
    assert.equal(res.body.includes('internal stale timestamp'),false);
  } finally { global.fetch=original; restore(); }
});


test('DELETE requires expected_updated_at before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('DELETE',{
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    }),res);
    assert.equal(res.statusCode,428);
    assert.equal(JSON.parse(res.body).error.code,'WRITE_PRECONDITION_REQUIRED');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('DELETE forwards optimistic concurrency token to checked item delete RPC', async () => {
  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('DELETE',{
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expected_updated_at:'2026-09-20T00:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_items_delete_checked');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_expected_updated_at:'2026-09-20T00:00:00.000Z'
    });
  } finally { global.fetch=original; restore(); }
});

test('stale item delete maps DP309 to stable 409', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP309',message:'internal stale delete timestamp'};}});
  try {
    const res=makeRes();
    await handler(makeReq('DELETE',{
      id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expected_updated_at:'2026-09-20T00:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'STALE_WRITE');
    assert.equal(res.body.includes('internal stale delete timestamp'),false);
  } finally { global.fetch=original; restore(); }
});
