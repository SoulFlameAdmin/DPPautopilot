'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/organizations.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method,body,auth='Bearer onboarding-token'){
  return {method,body,query:{},headers:auth?{authorization:auth}:{}};
}
async function withEnvFetch(fetchImpl,fn){
  const original=global.fetch;
  const oldUrl=process.env.SUPABASE_URL;
  const oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  global.fetch=fetchImpl;
  try{return await fn();}
  finally{
    global.fetch=original;
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  }
}

test('POST requires bearer authentication before upstream',async()=>{
  let called=false;
  await withEnvFetch(async()=>{called=true;throw new Error('should not call');},async()=>{
    const res=makeRes();
    await handler(req('POST',{name:'Pilot Org',slug:'pilot-org'},null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  });
});

test('GET lists only caller organizations and explicit active tenant state',async()=>{
  let seen;
  await withEnvFetch(async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return [{
      organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name:'Pilot Org',slug:'pilot-org',role:'owner',active:true
    }];}};
  },async()=>{
    const res=makeRes();
    await handler(req('GET',null),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_organizations_list');
    assert.equal(seen.options.headers.Authorization,'Bearer onboarding-token');
    assert.deepEqual(JSON.parse(seen.options.body),{});
    const body=JSON.parse(res.body);
    assert.equal(body.data.length,1);
    assert.equal(body.data[0].active,true);
    assert.equal(body.data[0].role,'owner');
  });
});

test('POST validates and forwards organization creation RPC',async()=>{
  let seen;
  await withEnvFetch(async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name:'Pilot Org',slug:'pilot-org',role:'owner',active:true
    };}};
  },async()=>{
    const res=makeRes();
    await handler(req('POST',{name:'  Pilot Org  ',slug:'pilot-org'}),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_organization_create');
    assert.equal(seen.options.headers.Authorization,'Bearer onboarding-token');
    assert.deepEqual(JSON.parse(seen.options.body),{p_name:'Pilot Org',p_slug:'pilot-org'});
    const body=JSON.parse(res.body);
    assert.equal(body.data.role,'owner');
    assert.equal(body.data.active,true);
  });
});

test('local validation rejects invalid slug before upstream',async()=>{
  let called=false;
  await withEnvFetch(async()=>{called=true;throw new Error('should not call');},async()=>{
    const res=makeRes();
    await handler(req('POST',{name:'Pilot Org',slug:'Bad Slug'}),res);
    assert.equal(res.statusCode,422);
    assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
    assert.equal(called,false);
  });
});

test('organization conflict maps to stable 409 without DB detail leak',async()=>{
  await withEnvFetch(async()=>({
    ok:false,
    async json(){return {code:'23505',message:'duplicate key secret detail'};}
  }),async()=>{
    const res=makeRes();
    await handler(req('POST',{name:'Pilot Org',slug:'pilot-org'}),res);
    const body=JSON.parse(res.body);
    assert.equal(res.statusCode,409);
    assert.equal(body.error.code,'ORGANIZATION_CONFLICT');
    assert.equal(res.body.includes('duplicate key secret detail'),false);
  });
});

test('unsupported methods return 405 with Allow header',async()=>{
  const res=makeRes();
  await handler(req('PUT',null),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET, POST');
});
