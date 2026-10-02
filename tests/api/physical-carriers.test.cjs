'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const carriers=require('../../api/carriers.js');
const carrierOpen=require('../../api/carrier-open.js');

function makeRes(){
  return {statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},end(v){this.body=v||'';}};
}
function makeReq(method,body={},query={},auth='Bearer test-token'){
  return {method,body,query,headers:auth?{authorization:auth}:{}};
}
function withEnv(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}

test('carrier API requires authentication',async()=>{
  const res=makeRes();
  await carriers(makeReq('GET',{}, {}, null),res);
  assert.equal(res.statusCode,401);
});

test('carrier bind accepts NTAG215 as URL carrier and forwards no secrets',async()=>{
  const restore=withEnv(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      carrier_kind:'nfc',
      nfc_technology:'ntag215',
      public_url:'https://dpp.example/b/BAT-000001',
      external_uid:null,
      status:'active',
      bound_at:'2026-10-02T18:00:00Z',
      revoked_at:null
    };}};
  };
  try{
    const res=makeRes();
    await carriers(makeReq('POST',{
      battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      carrier_kind:'nfc',
      nfc_technology:'ntag215',
      public_url:'https://dpp.example/b/BAT-000001'
    }),res);
    assert.equal(res.statusCode,201);
    const payload=JSON.parse(seen.options.body);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_carrier_bind');
    assert.equal(payload.p_nfc_technology,'ntag215');
    assert.equal(payload.p_public_url,'https://dpp.example/b/BAT-000001');
    assert.equal(Object.keys(payload).some(k=>/password|secret|role/i.test(k)),false);
  }finally{
    global.fetch=original;
    restore();
  }
});

test('QR carrier rejects NFC technology',async()=>{
  const res=makeRes();
  await carriers(makeReq('POST',{
    battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    carrier_kind:'qr',
    nfc_technology:'ntag215',
    public_url:'https://dpp.example/b/BAT-000001'
  }),res);
  assert.equal(res.statusCode,422);
});

test('carrier URL rejects insecure remote HTTP',()=>{
  assert.equal(carriers._test.validPublicUrl('http://example.com/b/1'),false);
  assert.equal(carriers._test.validPublicUrl('https://example.com/b/1'),true);
  assert.equal(carriers._test.validPublicUrl('http://127.0.0.1:8000/b/1'),true);
});

test('public carrier open does not require login',async()=>{
  const restore=withEnv(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      passport_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      unique_identifier:'BAT-000001',
      status:'active',
      public_payload:{manufacturer:'Demo'},
      updated_at:'2026-10-02T18:00:00Z'
    };}};
  };
  try{
    const res=makeRes();
    await carrierOpen(makeReq('GET',{}, {identifier:'BAT-000001',source:'unknown'},null),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_carrier_open');
    assert.equal(Object.prototype.hasOwnProperty.call(seen.options.headers,'Authorization'),false);
  }finally{
    global.fetch=original;
    restore();
  }
});

test('public carrier open rejects fake source/device attribution',async()=>{
  const res=makeRes();
  await carrierOpen(makeReq('GET',{}, {identifier:'BAT-000001',source:'phone-id'},null),res);
  assert.equal(res.statusCode,400);
});

test('carrier revoke maps missing active carrier to stable 404',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP705',message:'internal detail'};}});
  try{
    const res=makeRes();
    await carriers(makeReq('PATCH',{
      id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      reason:'replace'
    }),res);
    assert.equal(res.statusCode,404);
    assert.equal(JSON.parse(res.body).error.code,'CARRIER_NOT_FOUND');
    assert.equal(res.body.includes('internal detail'),false);
  }finally{
    global.fetch=original;
    restore();
  }
});
