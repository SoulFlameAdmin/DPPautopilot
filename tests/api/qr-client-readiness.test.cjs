'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/qr.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function makeReq(identifier){
  return {method:'GET',query:{identifier},headers:{'x-forwarded-for':'203.0.113.'+Math.floor(Math.random()*200+1)}};
}
function env(){
  const old={
    url:process.env.DPP_SUPABASE_URL,
    key:process.env.DPP_SUPABASE_PUBLISHABLE_KEY,
    origin:process.env.DPP_PUBLIC_ORIGIN
  };
  process.env.DPP_SUPABASE_URL='https://example.supabase.co';
  process.env.DPP_SUPABASE_PUBLISHABLE_KEY='publishable-key';
  process.env.DPP_PUBLIC_ORIGIN='https://dpp.example';
  return ()=>{
    for(const [k,v] of Object.entries({
      DPP_SUPABASE_URL:old.url,
      DPP_SUPABASE_PUBLISHABLE_KEY:old.key,
      DPP_PUBLIC_ORIGIN:old.origin
    })){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  };
}
function jsonResponse(status,body){
  return {ok:status>=200&&status<300,status,async json(){return body;}};
}

test('verifyActivePassport accepts only the exact ACTIVE public passport',async()=>{
  const restore=env();
  try{
    const ok=await handler._test.verifyActivePassport(
      'BAT-001',
      process.env,
      async()=>jsonResponse(200,{kind:'active',status:'active',unique_identifier:'BAT-001'})
    );
    const wrong=await handler._test.verifyActivePassport(
      'BAT-001',
      process.env,
      async()=>jsonResponse(200,{kind:'active',status:'active',unique_identifier:'BAT-002'})
    );
    const draft=await handler._test.verifyActivePassport(
      'BAT-001',
      process.env,
      async()=>jsonResponse(200,{kind:'draft',status:'draft',unique_identifier:'BAT-001'})
    );
    const missing=await handler._test.verifyActivePassport(
      'BAT-001',
      process.env,
      async()=>jsonResponse(404,{error:'not found'})
    );
    assert.equal(ok,true);
    assert.equal(wrong,false);
    assert.equal(draft,false);
    assert.equal(missing,false);
  }finally{restore();}
});

test('QR endpoint fails closed when passport does not exist',async()=>{
  const restore=env();
  const originalFetch=global.fetch;
  global.fetch=async()=>jsonResponse(404,{error:'not found'});
  try{
    const res=makeRes();
    await handler(makeReq('BAT-DOES-NOT-EXIST'),res);
    assert.equal(res.statusCode,404);
    assert.equal(res.headers['content-type'],'application/json; charset=utf-8');
    assert.match(res.body,/PUBLIC_PASSPORT_NOT_FOUND/);
    assert.doesNotMatch(res.body,/<svg/);
  }finally{global.fetch=originalFetch;restore();}
});

test('QR endpoint encodes exact canonical carrier URL for ACTIVE passport',async()=>{
  const restore=env();
  const originalFetch=global.fetch;
  global.fetch=async()=>jsonResponse(200,{kind:'active',status:'active',unique_identifier:'BAT-001'});
  try{
    const res=makeRes();
    await handler(makeReq('BAT-001'),res);
    assert.equal(res.statusCode,200);
    assert.equal(res.headers['content-type'],'image/svg+xml; charset=utf-8');
    assert.equal(res.headers['x-dpp-carrier'],'qr');
    assert.equal(res.headers['x-dpp-identifier'],'BAT-001');
    assert.equal(res.headers['x-dpp-target'],'https://dpp.example/passport?identifier=BAT-001&carrier=qr');
    assert.match(res.body,/<svg/);
  }finally{global.fetch=originalFetch;restore();}
});
