'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/supplier-reminders.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}

function makeReq(method,body,query,auth='Bearer test-token'){
  return {method,body,query:query||{},headers:auth?{authorization:auth}:{}};
}

function fixture(overrides={}){
  return {
    id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    supplier_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    subject_kind:'component',
    subject_ref:'cell:NMC-21700',
    missing_fields:['country_of_origin'],
    channel:'email',
    delivery_status:'queued',
    created_at:'2026-10-02T00:00:00.000Z',
    ...overrides
  };
}

function setEnv(){
  const oldUrl=process.env.SUPABASE_URL;
  const oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}

test('BAT59 rejects missing bearer auth before upstream access',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(makeReq('POST',{},null,null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('BAT59 validates reminder request locally',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(makeReq('POST',{
      supplier_id:'not-a-uuid',
      subject_kind:'component',
      subject_ref:'cell:NMC-21700'
    }),res);
    assert.equal(res.statusCode,422);
    assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('BAT59 POST derives reminder through tenant-scoped RPC',async()=>{
  const original=global.fetch;
  const restore=setEnv();
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return fixture();}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('POST',{
      supplier_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      subject_kind:'component',
      subject_ref:'  cell:NMC-21700  ',
      channel:'email'
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_supplier_reminder_create');
    assert.equal(seen.options.headers.Authorization,'Bearer test-token');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_supplier_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_subject_kind:'component',
      p_subject_ref:'cell:NMC-21700',
      p_channel:'email'
    });
    assert.deepEqual(JSON.parse(res.body).data.missing_fields,['country_of_origin']);
  }finally{
    global.fetch=original;
    restore();
  }
});

test('BAT59 GET lists only through tenant-scoped RPC',async()=>{
  const original=global.fetch;
  const restore=setEnv();
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return [fixture()];}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET',null,{supplier_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_supplier_reminders_list');
    assert.deepEqual(JSON.parse(seen.options.body),{p_supplier_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
  }finally{
    global.fetch=original;
    restore();
  }
});

test('BAT59 database RBAC denial maps to stable 403',async()=>{
  const original=global.fetch;
  const restore=setEnv();
  global.fetch=async()=>({ok:false,async json(){return {code:'DP103',message:'internal role detail'};}});
  try{
    const res=makeRes();
    await handler(makeReq('POST',{
      supplier_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      subject_kind:'component',
      subject_ref:'cell:NMC-21700'
    }),res);
    assert.equal(res.statusCode,403);
    assert.equal(JSON.parse(res.body).error.code,'FORBIDDEN');
    assert.equal(res.body.includes('internal role detail'),false);
  }finally{
    global.fetch=original;
    restore();
  }
});

test('BAT59 cross-tenant/not-found supplier maps to stable 404',async()=>{
  const original=global.fetch;
  const restore=setEnv();
  global.fetch=async()=>({ok:false,async json(){return {code:'DP601',message:'secret supplier detail'};}});
  try{
    const res=makeRes();
    await handler(makeReq('POST',{
      supplier_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      subject_kind:'component',
      subject_ref:'cell:NMC-21700'
    }),res);
    assert.equal(res.statusCode,404);
    assert.equal(JSON.parse(res.body).error.code,'SUPPLIER_NOT_FOUND');
    assert.equal(res.body.includes('secret supplier detail'),false);
  }finally{
    global.fetch=original;
    restore();
  }
});

test('BAT59 no-current-missing-data maps to stable 409',async()=>{
  const original=global.fetch;
  const restore=setEnv();
  global.fetch=async()=>({ok:false,async json(){return {code:'DP603',message:'internal queue detail'};}});
  try{
    const res=makeRes();
    await handler(makeReq('POST',{
      supplier_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      subject_kind:'component',
      subject_ref:'cell:NMC-21700'
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'NO_MISSING_SUPPLIER_DATA');
  }finally{
    global.fetch=original;
    restore();
  }
});

test('BAT59 unsupported methods return 405',async()=>{
  const res=makeRes();
  await handler(makeReq('DELETE',{}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET, POST');
});

test('BAT59 rejects malformed successful upstream shape',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async()=>({ok:true,async json(){return {id:'bad'};}});
  await assert.rejects(
    ()=>handler._test.rpc(
      'dpp_api_supplier_reminder_create',
      {},
      'Bearer test-token',
      env,
      fetchImpl,
      50
    ),
    error=>{
      assert.equal(error.status,502);
      assert.equal(error.publicCode,'UPSTREAM_ERROR');
      return true;
    }
  );
});
