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

test('private GET strips authority-only fields while preserving legitimate-interest data', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({
    ok:true,
    async json(){
      return {
        passport_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        private_payload:{
          model:{
            restricted_composition:{cathode:'NMC-811'},
            compliance_test_reports:['AUTHORITY-ONLY-REPORT']
          },
          item:{state_of_health:{percent:97}}
        }
      };
    }
  });
  try {
    const res=makeRes();
    await handler(makeReq('GET',null,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),res);
    assert.equal(res.statusCode,200);
    const data=JSON.parse(res.body).data;
    assert.equal(data.private_payload.model.compliance_test_reports,undefined);
    assert.equal(data.private_payload.model.restricted_composition.cathode,'NMC-811');
    assert.equal(data.private_payload.item.state_of_health.percent,97);
    assert.equal(res.body.includes('AUTHORITY-ONLY-REPORT'),false);
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


test('public GET strips catalog-restricted nested fields even if upstream regresses', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({
    ok:true,
    async json(){
      return {
        passport_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        unique_identifier:'urn:dpp:public-safe',
        status:'active',
        public_payload:{
          model:{
            identification:{manufacturer:{name:'Safe Maker'}},
            restricted_composition:{secret:'MODEL-SECRET'},
            compliance_test_reports:['AUTHORITY-SECRET']
          },
          item:{
            unique_identifier:'urn:dpp:public-safe',
            state_of_health:{percent:95},
            performance_history:[{secret:true}],
            usage:{cycles:42},
            telemetry:{environment:[{temperature:31}]}
          }
        },
        private_payload:{secret_marker:'TOP-LEVEL-SECRET'},
        organization_id:'tenant-secret'
      };
    }
  });
  try {
    const res=makeRes();
    await handler(makeReq('GET',null,{identifier:'urn:dpp:public-safe'},null),res);
    assert.equal(res.statusCode,200);
    const data=JSON.parse(res.body).data;
    assert.equal(data.private_payload,undefined);
    assert.equal(data.organization_id,undefined);
    assert.equal(data.public_payload.model.identification.manufacturer.name,'Safe Maker');
    assert.equal(data.public_payload.item.unique_identifier,'urn:dpp:public-safe');
    assert.equal(data.public_payload.model.restricted_composition,undefined);
    assert.equal(data.public_payload.model.compliance_test_reports,undefined);
    assert.equal(data.public_payload.item.state_of_health,undefined);
    assert.equal(data.public_payload.item.performance_history,undefined);
    assert.equal(data.public_payload.item.usage,undefined);
    assert.equal(data.public_payload.item.telemetry,undefined);
    assert.equal(res.body.includes('MODEL-SECRET'),false);
    assert.equal(res.body.includes('AUTHORITY-SECRET'),false);
    assert.equal(res.body.includes('TOP-LEVEL-SECRET'),false);
  } finally { global.fetch=original; restore(); }
});


test('POST rejects restricted public fields before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('POST',{
      battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      public_payload:{
        model:{
          identification:{manufacturer:{name:'Safe Maker'}},
          restricted_composition:{secret:true}
        }
      },
      private_payload:{}
    }),res);
    assert.equal(res.statusCode,422);
    assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('PATCH rejects authority-only public fields before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    const res=makeRes();
    await handler(makeReq('PATCH',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expected_updated_at:'2026-09-20T00:00:00.000Z',
      public_payload:{
        model:{
          compliance_test_reports:['secret-report']
        }
      }
    }),res);
    assert.equal(res.statusCode,422);
    assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('POST and PATCH reject authority-only private fields before upstream access', async () => {
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true; throw new Error('unexpected');};
  try {
    let res=makeRes();
    await handler(makeReq('POST',{
      battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      public_payload:{item:{unique_identifier:'urn:dpp:safe'}},
      private_payload:{model:{compliance_test_reports:['AUTHORITY-ONLY-REPORT']}}
    }),res);
    assert.equal(res.statusCode,403);
    assert.equal(JSON.parse(res.body).error.code,'FORBIDDEN');
    assert.equal(called,false);

    res=makeRes();
    await handler(makeReq('PATCH',{
      id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expected_updated_at:'2026-09-20T00:00:00.000Z',
      private_payload:{model:{compliance_test_reports:['AUTHORITY-ONLY-REPORT']}}
    }),res);
    assert.equal(res.statusCode,403);
    assert.equal(JSON.parse(res.body).error.code,'FORBIDDEN');
    assert.equal(called,false);
  } finally { global.fetch=original; }
});

test('POST allows legitimate-interest private fields through to upstream', async () => {
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
      public_payload:{item:{unique_identifier:'urn:dpp:safe-private'}},
      private_payload:{
        model:{restricted_composition:{cathode:'NMC-811'}},
        item:{state_of_health:{percent:97}}
      }
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_passport_create');
  } finally { global.fetch=original; restore(); }
});

test('POST allows catalog-public fields through to upstream', async () => {
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
      public_payload:{
        model:{identification:{manufacturer:{name:'Safe Maker'},category:'electric_vehicle',model_id:'SAFE-1'}},
        item:{unique_identifier:'urn:dpp:safe:1'}
      },
      private_payload:{}
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_passport_create');
  } finally { global.fetch=original; restore(); }
});


test('passport create conflict DP412 maps to stable 409', async () => {
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP412',message:'internal duplicate detail'};}});
  try {
    const res=makeRes();
    await handler(makeReq('POST',{
      battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      public_payload:{item:{unique_identifier:'urn:dpp:1'}},
      private_payload:{}
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'PASSPORT_CONFLICT');
    assert.equal(res.body.includes('internal duplicate detail'),false);
  } finally { global.fetch=original; restore(); }
});


test('M19 passport RPC times out while upstream response body stalls', async () => {
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
    ()=>handler._test.rpc('dpp_api_passport_public',{},null,env,fetchImpl,5),
    error=>{
      assert.equal(error.status,504);
      assert.equal(error.publicCode,'UPSTREAM_TIMEOUT');
      assert.equal(error.publicMessage,'Database request timed out.');
      return true;
    }
  );
});

test('M19 passport RPC rejects malformed successful upstream JSON', async () => {
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async()=>({
    ok:true,
    async json(){throw new SyntaxError('malformed upstream json');}
  });
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_passport_public',{},null,env,fetchImpl,50),
    error=>{
      assert.equal(error.status,502);
      assert.equal(error.publicCode,'UPSTREAM_ERROR');
      assert.equal(error.publicMessage,'Database request failed.');
      assert.equal(String(error).includes('malformed upstream json'),false);
      return true;
    }
  );
});
