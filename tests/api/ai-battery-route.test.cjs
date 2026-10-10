'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../api/ai-battery-candidates.js'),'utf8');
function harness({feature=true,authorized=true,modelError=null,limit='allowed'}={}){
 const calls={auth:0,ai:0,rate:0};
 class GPTError extends Error{constructor(code,status=502){super(code);this.code=code;this.status=status;}}
 const mocks={
  './_request.js':{parseBody:req=>req.body,bodyErrorResponse:()=>({status:400,body:{error:{code:'BAD_BODY'}}})},
  './_rate_limit.js':{
   enforceRateLimit:()=>({allowed:limit!=='local'}),
   enforceSharedRateLimit:async()=>{calls.rate++;return limit==='shared_error'?{error:true}:limit==='shared'?{allowed:false}:{allowed:true};},
   sharedRateLimitUnavailableBody:()=>({error:{code:'RATE_UNAVAILABLE'}}),
   rateLimitBody:()=>({error:{code:'RATE_LIMITED'}})
  },
  './_observability.js':{startRequestObservability:()=>{}},
  './_ai_lmt_auth.js':(()=>{
   class LMTAuthError extends Error{constructor(code,status=401){super(code);this.code=code;this.status=status;}}
   return {LMTAuthError,validateBearerSupabase:async()=>{calls.auth++;if(!authorized)throw new LMTAuthError('AUTH_INVALID',401);return {user_id:'test-user'};}};
  })(),
  './_ai_lmt_candidate_extractor.js':{
   BatteryGPTError:GPTError,MAX_PROMPT_CHARS:10000,
   extractBatteryCandidates:async()=>{calls.ai++;if(modelError)throw new GPTError(modelError);return {candidates:[],verified:false,can_publish:false,can_generate_battery_passport:false};}
  }
 };
 const mod={exports:{}};
 vm.runInNewContext(src,{module:mod,exports:mod.exports,process:{env:{}},require:name=>{
  if(!(name in mocks))throw Error('Unexpected dependency '+name);
  return mocks[name];
 }},{filename:'ai-battery-candidates.js'});
 const env={AI_BATTERY_CANDIDATE_API_ENABLED:feature?'true':'false'};
 const handler=mod.exports._test.createHandler({env,fetchImpl:async()=>{throw Error('Unexpected external request');}});
 const res=()=>{let body='';return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){body=v;},get data(){return JSON.parse(body);}}};
 const req=(body={prompt:'capacity 12 Ah'})=>({method:'POST',headers:{authorization:'Bearer token'},body,socket:{remoteAddress:'127.0.0.1'}});
 return {calls,handler,res,req};
}
test('missing authentication returns 401 before GPT use',async()=>{
 const h=harness(),res=h.res();await h.handler({...h.req(),headers:{}},res);
 assert.equal(res.statusCode,401);assert.equal(h.calls.ai,0);
});
test('GET refused with 405 and no GPT billing',async()=>{
 const h=harness(),res=h.res();await h.handler({...h.req(),method:'GET'},res);
 assert.equal(res.statusCode,405);assert.equal(h.calls.ai,0);
});
test('forged tenant and verification input fields rejected before AI call',async()=>{
 const h=harness(),res=h.res();await h.handler(h.req({prompt:'capacity 12 Ah',tenant_id:'other',verified:true}),res);
 assert.equal(res.statusCode,422);assert.equal(h.calls.ai,0);
});
test('feature flag defaults to fail-closed',async()=>{
 const h=harness({feature:false}),res=h.res();await h.handler(h.req(),res);
 assert.equal(res.statusCode,503);assert.equal(h.calls.ai,0);
});
test('invalid bearer denies GPT call',async()=>{
 const h=harness({authorized:false}),res=h.res();await h.handler(h.req(),res);
 assert.equal(res.statusCode,401);assert.equal(h.calls.ai,0);assert.equal(h.calls.auth,1);
});
test('valid bearer + bounded prompt returns unverified candidates and no-store',async()=>{
 const h=harness(),res=h.res();await h.handler(h.req(),res);
 assert.equal(res.statusCode,200);assert.equal(h.calls.ai,1);assert.equal(h.calls.auth,1);
 assert.equal(res.data.data.can_publish,false);
 assert.equal(res.headers['Cache-Control'],'no-store');
});
test('GPT failure never returns unverified facts as approved',async()=>{
 const h=harness({modelError:'AI_OUTPUT_INVALID'}),res=h.res();await h.handler(h.req(),res);
 assert.equal(res.statusCode,502);
 assert.deepEqual(Object.keys(res.data),['error']);
});
test('local limit 429 blocks auth and GPT',async()=>{
 const h=harness({limit:'local'}),res=h.res();await h.handler(h.req(),res);
 assert.equal(res.statusCode,429);assert.equal(h.calls.auth,0);assert.equal(h.calls.ai,0);
});
test('shared rate-limit denial 429 fails closed',async()=>{
 const h=harness({limit:'shared'}),res=h.res();await h.handler(h.req(),res);
 assert.equal(res.statusCode,429);assert.equal(h.calls.ai,0);
});
test('shared rate service unavailable 503 fails closed',async()=>{
 const h=harness({limit:'shared_error'}),res=h.res();await h.handler(h.req(),res);
 assert.equal(res.statusCode,503);assert.equal(h.calls.ai,0);
});
