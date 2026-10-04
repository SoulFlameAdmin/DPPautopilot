'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/passport.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method='GET',body={},query={},auth='Bearer step18-token'){
  return {method,body,query,headers:{...(auth?{authorization:auth}:{}),'x-forwarded-for':'203.0.113.118'}};
}
function withEnv(){
  const old={
    url:process.env.DPP_SUPABASE_URL,
    key:process.env.DPP_SUPABASE_PUBLISHABLE_KEY,
    shared:process.env.DPP_SHARED_RATE_LIMIT_ENABLED
  };
  process.env.DPP_SUPABASE_URL='https://example.supabase.co';
  process.env.DPP_SUPABASE_PUBLISHABLE_KEY='publishable-key';
  process.env.DPP_SHARED_RATE_LIMIT_ENABLED='false';
  return ()=>{
    const vals={DPP_SUPABASE_URL:old.url,DPP_SUPABASE_PUBLISHABLE_KEY:old.key,DPP_SHARED_RATE_LIMIT_ENABLED:old.shared};
    for(const [k,v] of Object.entries(vals)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  };
}
const passportId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const itemId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const modelId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('authenticated readiness GET calls the LMT readiness RPC and returns only readiness metadata',async()=>{
  const restore=withEnv(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      passport_id:passportId,battery_item_id:itemId,model_id:modelId,
      unique_identifier:'BAT-S18-001',status:'draft',schema_version:'2.0.0-lmt-2026-10-04',
      missing_points:[50],undecided_conditional_points:[35],missing_count:1,undecided_count:1,ready:false
    };}};
  };
  try{
    const res=makeRes();
    await handler(req('GET',null,{id:passportId,readiness:'1'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_scooter_passport_readiness');
    const body=JSON.parse(seen.options.body);
    assert.deepEqual(body,{p_passport_id:passportId});
    const data=JSON.parse(res.body).data;
    assert.equal(data.ready,false);
    assert.deepEqual(data.missing_points,[50]);
    assert.equal(Object.prototype.hasOwnProperty.call(data,'private_payload'),false);
  }finally{global.fetch=original;restore();}
});

test('PATCH action activate calls only the readiness-gated activation RPC',async()=>{
  const restore=withEnv(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      passport_id:passportId,battery_item_id:itemId,status:'active',
      public_payload:{item:{unique_identifier:'BAT-S18-001'}},private_payload:{},
      created_at:'2026-10-04T16:00:00.000Z',updated_at:'2026-10-04T16:01:00.000Z'
    };}};
  };
  try{
    const res=makeRes();
    await handler(req('PATCH',{id:passportId,action:'activate',expected_updated_at:'2026-10-04T16:00:00.000Z'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_scooter_passport_activate');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_passport_id:passportId,p_expected_updated_at:'2026-10-04T16:00:00.000Z'
    });
    assert.equal(JSON.parse(res.body).data.status,'active');
  }finally{global.fetch=original;restore();}
});

test('generic active status bypass maps to ACTIVATION_ROUTE_REQUIRED without DB detail leak',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP610',message:'internal readiness detail'};}});
  try{
    const res=makeRes();
    await handler(req('PATCH',{
      id:passportId,status:'active',expected_updated_at:'2026-10-04T16:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'ACTIVATION_ROUTE_REQUIRED');
    assert.equal(res.body.includes('internal readiness detail'),false);
  }finally{global.fetch=original;restore();}
});

test('unknown passport action is rejected locally before upstream',async()=>{
  const original=global.fetch;let called=false;
  global.fetch=async()=>{called=true;throw new Error('must not call');};
  try{
    const res=makeRes();
    await handler(req('PATCH',{
      id:passportId,action:'force-active',expected_updated_at:'2026-10-04T16:00:00.000Z'
    }),res);
    assert.equal(res.statusCode,422);
    assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('readiness response shape fails closed when upstream is malformed',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:true,async json(){return {ready:true,missing_points:[]};}});
  try{
    const res=makeRes();
    await handler(req('GET',null,{id:passportId,readiness:'1'}),res);
    assert.equal(res.statusCode,502);
    assert.equal(JSON.parse(res.body).error.code,'UPSTREAM_ERROR');
  }finally{global.fetch=original;restore();}
});
