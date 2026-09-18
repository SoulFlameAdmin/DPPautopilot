'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/export.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function makeReq(method='GET',auth='Bearer test-token'){
  return {method,headers:auth?{authorization:auth}:{}};
}
function withEnv(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}

test('requires bearer auth before upstream access',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(makeReq('GET',null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('GET forwards caller bearer to owner/admin export RPC',async()=>{
  const restore=withEnv(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {schema_version:1,organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',counts:{battery_models:1}};}};
  };
  try{
    const res=makeRes();
    await handler(makeReq(),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_export_bundle');
    assert.equal(seen.options.headers.Authorization,'Bearer test-token');
    assert.equal(seen.options.headers.apikey,'anon-key');
    assert.equal(seen.options.body,'{}');
    assert.equal(res.headers['cache-control'],'no-store');
    assert.equal(res.headers['content-disposition'],'attachment; filename="dpp-export.json"');
    assert.equal(JSON.parse(res.body).data.schema_version,1);
  }finally{global.fetch=original;restore();}
});

test('RBAC denial maps to stable 403 without DB detail leak',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP104',message:'viewer role detail'};}});
  try{
    const res=makeRes();
    await handler(makeReq(),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,403);
    assert.equal(payload.error.code,'FORBIDDEN');
    assert.equal(res.body.includes('viewer role detail'),false);
  }finally{global.fetch=original;restore();}
});

test('missing server configuration fails closed',async()=>{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  try{
    const res=makeRes();
    await handler(makeReq(),res);
    assert.equal(res.statusCode,500);
    assert.equal(JSON.parse(res.body).error.code,'SERVER_CONFIGURATION_MISSING');
  }finally{
    if(oldUrl!==undefined) process.env.SUPABASE_URL=oldUrl;
    if(oldKey!==undefined) process.env.SUPABASE_ANON_KEY=oldKey;
  }
});

test('unsupported methods return 405',async()=>{
  const res=makeRes();
  await handler(makeReq('POST'),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET');
});
