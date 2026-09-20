'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/passport.js');

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

test('public GET uses anon RPC without bearer', async () => {
  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {status:'active',public_payload:{item:{unique_identifier:'urn:dpp:1'}}};}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('GET',null,{identifier:' urn:dpp:1 '},null),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_passport_public');
    assert.equal(seen.options.headers.Authorization,undefined);
    assert.equal(seen.options.headers.apikey,'anon-key');
    assert.deepEqual(JSON.parse(seen.options.body),{p_unique_identifier:'urn:dpp:1'});
  } finally { global.fetch=original; restore(); }
});

test('private GET requires bearer before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('GET',null,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('private GET forwards caller bearer', async () => {
  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {passport_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',private_payload:{secret:true}};}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('GET',null,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_passport_private');
    assert.equal(seen.options.headers.Authorization,'Bearer test-token');
  } finally { global.fetch=original; restore(); }
});

test('POST requires auth and validates item/payload shapes', async () => {
  let res=makeRes();
  await handler(makeReq('POST',{battery_item_id:'bad'},null,null),res);
  assert.equal(res.statusCode,401);

  res=makeRes();
  await handler(makeReq('POST',{battery_item_id:'bad'}),res);
  assert.equal(res.statusCode,422);

  res=makeRes();
  await handler(makeReq('POST',{
    battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    public_payload:[],
    private_payload:{}
  }),res);
  assert.equal(res.statusCode,422);
});

test('POST forwards controlled write to passport RPC', async () => {
  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {passport_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:'draft'};}};
  };
  try {
    const res=makeRes();
    await handler(makeReq('POST',{
      battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      public_payload:{item:{unique_identifier:'urn:dpp:1'}},
      private_payload:{state_of_health:{percent:97}}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_passport_create');
    assert.equal(seen.options.headers.Authorization,'Bearer test-token');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_public_payload:{item:{unique_identifier:'urn:dpp:1'}},
      p_private_payload:{state_of_health:{percent:97}}
    });
  } finally { global.fetch=original; restore(); }
});

test('PATCH validates status and forwards update', async () => {
  let res=makeRes();
  await handler(makeReq('PATCH',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'bad',expected_updated_at:'2026-09-19T04:00:00.000Z'}),res);
  assert.equal(res.statusCode,422);

  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {passport_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'active'};}};
  };
  try {
    res=makeRes();
    await handler(makeReq('PATCH',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status:'active',
      expected_updated_at:'2026-09-19T04:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_passport_update_checked');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_status:'active',
      p_public_payload:null,
      p_private_payload:null,
      p_expected_updated_at:'2026-09-19T04:00:00.000Z'
    });
  } finally { global.fetch=original; restore(); }
});

test('privacy policy violation maps to stable 422 without DB detail leak', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP409',message:'restricted field name leak'};}});
  try {
    const res=makeRes();
    await handler(makeReq('POST',{
      battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      public_payload:{model:{restricted_composition:{secret:true}}},
      private_payload:{}
    }),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,422);
    assert.equal(payload.error.code,'VALIDATION_ERROR');
    assert.equal(res.body.includes('restricted field name leak'),false);
  } finally { global.fetch=original; restore(); }
});

test('not-found contracts are stable and non-enumerating', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP403',message:'internal tenant detail'};}});
  try {
    const res=makeRes();
    await handler(makeReq('GET',null,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,404);
    assert.equal(payload.error.code,'PASSPORT_NOT_FOUND');
    assert.equal(res.body.includes('internal tenant detail'),false);
  } finally { global.fetch=original; restore(); }
});

test('unsupported methods return 405', async () => {
  const res=makeRes();
  await handler(makeReq('DELETE',{}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET, POST, PATCH');
});


test('PATCH requires expected_updated_at before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status:'active'
    }),res);
    assert.equal(res.statusCode,428);
    assert.equal(JSON.parse(res.body).error.code,'WRITE_PRECONDITION_REQUIRED');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('stale passport write maps DP411 to stable 409', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP411',message:'internal stale timestamp'};}});
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status:'active',
      expected_updated_at:'2026-09-19T04:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'STALE_WRITE');
    assert.equal(res.body.includes('internal stale timestamp'),false);
  } finally { global.fetch=original; restore(); }
});

test('public GET strips unexpected private and tenant metadata from upstream response', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({
    ok:true,
    async json(){
      return {
        passport_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organization_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        unique_identifier:'urn:dpp:public-safe:1',
        status:'active',
        public_payload:{model:{identification:{model_id:'SAFE'}}},
        private_payload:{secret_marker:'M10_HTTP_PRIVATE_SECRET'},
        created_by:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        created_at:'2026-09-20T00:00:00.000Z',
        updated_at:'2026-09-20T00:01:00.000Z'
      };
    }
  });
  try {
    const res=makeRes();
    await handler(makeReq('GET',null,{identifier:'urn:dpp:public-safe:1'},null),res);
    assert.equal(res.statusCode,200);
    const payload=JSON.parse(res.body).data;
    assert.deepEqual(Object.keys(payload).sort(),[
      'passport_id','public_payload','status','unique_identifier','updated_at'
    ]);
    assert.equal(JSON.stringify(payload).includes('M10_HTTP_PRIVATE_SECRET'),false);
    assert.equal(Object.hasOwn(payload,'organization_id'),false);
    assert.equal(Object.hasOwn(payload,'battery_item_id'),false);
    assert.equal(Object.hasOwn(payload,'created_by'),false);
    assert.equal(Object.hasOwn(payload,'created_at'),false);
  } finally { global.fetch=original; restore(); }
});
