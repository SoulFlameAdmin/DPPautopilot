'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const limiter=require('../../api/_rate_limit.js');
const {MAX_BODY_BYTES}=require('../../api/_request.js');
const handlers={
  application:require('../../api/application.js'),
  'registration-link':require('../../api/registration-link.js'),
  'manufacturer-onboarding':require('../../api/manufacturer-onboarding.js')
};
function response(){return {statusCode:0,headers:{},body:'',
  setHeader(k,v){this.headers[k.toLowerCase()]=String(v)},
  end(v){this.body=v||''}
}}
function request(method,body,auth='Bearer synthetic-intake-token'){
  return {method,body,query:{email:'private-query@example.invalid'},headers:{
    ...(auth?{authorization:auth}:{}),'x-forwarded-for':'203.0.113.88',
    'x-request-id':'intake-security-test'
  }};
}

// Keep all requests local: no email, Auth, or database calls are allowed.
let originalFetch,oldShared,originalWarn,logs;
test.beforeEach(()=>{
  limiter._test.resetForTests();
  oldShared=process.env.DPP_SHARED_RATE_LIMIT_ENABLED;
  process.env.DPP_SHARED_RATE_LIMIT_ENABLED='false';
  originalFetch=global.fetch;
  global.fetch=async()=>{throw new Error('upstream must not be called')};
  originalWarn=console.warn;logs=[];console.warn=line=>logs.push(String(line));
});
test.afterEach(()=>{
  global.fetch=originalFetch;console.warn=originalWarn;
  if(oldShared===undefined)delete process.env.DPP_SHARED_RATE_LIMIT_ENABLED;
  else process.env.DPP_SHARED_RATE_LIMIT_ENABLED=oldShared;
});

for(const [surface,handler] of Object.entries(handlers)){
  for(const [name,body,status,code] of [
    ['oversized',{blob:'x'.repeat(MAX_BODY_BYTES+1)},413,'PAYLOAD_TOO_LARGE'],
    ['malformed','{"broken":',400,'INVALID_JSON'],
    ['invalid',{},422,'VALIDATION_ERROR']
  ]) test(`${surface}: ${name} body is rejected before upstream`,async()=>{
    let called=false;
    global.fetch=async()=>{called=true;throw new Error('upstream must not be called')};
    const res=response();await handler(request('POST',body),res);
    assert.equal(res.statusCode,status);
    assert.equal(JSON.parse(res.body).error.code,code);
    assert.equal(called,false);
  });

  test(`${surface}: 41st local write is denied, including anonymous registration`,async()=>{
    const auth=surface==='registration-link'?null:'Bearer synthetic-intake-token';
    for(let i=0;i<40;i++){
      const res=response();await handler(request('POST',{},auth),res);
      assert.equal(res.statusCode,422);
    }
    const res=response();await handler(request('POST',{},auth),res);
    assert.equal(res.statusCode,429);
    assert.equal(JSON.parse(res.body).error.code,'RATE_LIMITED');
    assert.ok(Number(res.headers['retry-after'])>0);
    assert.equal(res.headers['x-ratelimit-limit'],'40');
  });

  test(`${surface}: validation log excludes token, email, body and IP`,async()=>{
    const res=response();
    await handler(request('POST',{email:'invalid-private-email',secret:'private-body-value'}),res);
    assert.equal(res.statusCode,422);
    assert.equal(logs.length,1);
    const event=JSON.parse(logs[0]);
    assert.equal(event.surface,surface);
    assert.equal(event.error_code,'VALIDATION_ERROR');
    assert.equal(event.request_id,res.headers['x-request-id']);
    assert.deepEqual(Object.keys(event).sort(),[
      'event','timestamp_ms','request_id','surface','method','status','outcome',
      'duration_ms','auth_present','error_code'
    ].sort());
    for(const secret of ['synthetic-intake-token','invalid-private-email','private-body-value','private-query@example.invalid','203.0.113.88'])
      assert.equal(logs[0].includes(secret),false,secret);
  });
}

for(const method of ['GET','PATCH'])test(`registration-link: ${method} shares the explicit 40/min write budget`,async()=>{
  for(let i=0;i<40;i++){
    const res=response();await handlers['registration-link'](request(method,{},null),res);
    assert.equal(res.statusCode,401);
  }
  const res=response();await handlers['registration-link'](request(method,{},null),res);
  assert.equal(res.statusCode,429);
  assert.equal(res.headers['x-ratelimit-limit'],'40');
});
