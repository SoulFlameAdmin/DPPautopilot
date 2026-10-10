'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../api/_ai_lmt_auth.js'),'utf8');
const mod={exports:{}};
vm.runInNewContext(src,{module:mod,exports:mod.exports,process:{env:{}},
 AbortController,setTimeout,clearTimeout,require:name=>{
  if(name!=='./_supabase_config.js')throw Error('Unexpected dependency');
  return {getSupabaseConfig:()=>({base:'https://test.supabase.co',key:'sb_publishable_testing'})};
 }},{filename:'_ai_lmt_auth.js'});
const {validateBearerSupabase}=mod.exports;
const userId='00000000-0000-4000-8000-000000000001';
const opts=fetchImpl=>({fetchImpl,env:{}});
test('real Bearer is validated against Supabase Auth rather than decoded without verification',async()=>{
 let calls=0;
 const r=await validateBearerSupabase('Bearer token',opts(async(url,request)=>{
  calls++;assert.equal(url,'https://test.supabase.co/auth/v1/user');
  assert.equal(request.headers.Authorization,'Bearer token');
  return {ok:true,status:200,json:async()=>({id:userId})};
 }));
 assert.equal(r.user_id,userId);assert.equal(calls,1);
});
test('missing authorization rejected without networking',async()=>{
 let called=false;
 await assert.rejects(validateBearerSupabase('',opts(async()=>{called=true;})),e=>e.code==='AUTH_REQUIRED');
 assert.equal(called,false);
});
test('expired JWT denied',async()=>{
 await assert.rejects(validateBearerSupabase('Bearer expired',opts(async()=>({ok:false,status:401}))),e=>e.code==='AUTH_INVALID');
});
test('invalid provider UUID fails closed',async()=>{
 await assert.rejects(validateBearerSupabase('Bearer token',opts(async()=>({ok:true,status:200,json:async()=>({id:'fake'})}))),e=>e.code==='AUTH_RESPONSE_INVALID');
});
test('network outage never falls back to trusting token',async()=>{
 await assert.rejects(validateBearerSupabase('Bearer token',opts(async()=>{throw Error('offline');})),e=>e.code==='AUTH_SERVICE_UNAVAILABLE');
});
