'use strict';
// R05_RATE_LIMIT_PRECURSOR_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const limiter=require('../../api/_rate_limit.js');
const models=require('../../api/models.js');
const passport=require('../../api/passport.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method,body=null,query={},auth='Bearer abuse-token',ip='203.0.113.10'){
  return {
    method,body,query,
    headers:{
      ...(auth?{authorization:auth}:{}),
      'x-forwarded-for':ip
    }
  };
}
function json(res){return JSON.parse(res.body);}

test.beforeEach(()=>limiter._test.resetForTests());

test('classifies public/authenticated/import/export budgets deterministically',()=>{
  assert.equal(limiter.classify('passport',req('GET',null,{identifier:'urn:dpp:x'},null)),'public_passport_read');
  assert.equal(limiter.classify('models',req('GET')),'authenticated_read');
  assert.equal(limiter.classify('models',req('POST',{})),'authenticated_write');
  assert.equal(limiter.classify('imports',req('PATCH',{})),'import_write');
  assert.equal(limiter.classify('export',req('GET')),'export_read');
});

test('client identity hashes bearer credentials instead of storing raw tokens',()=>{
  const digest=limiter._test.authDigest(req('GET',null,{},'Bearer super-secret-token'));
  assert.match(digest,/^[0-9a-f]{24}$/);
  assert.equal(digest.includes('super-secret-token'),false);
});

test('fixed window denies the request after the configured budget and exposes retry metadata',()=>{
  const rules={authenticated_write:{limit:2,window_seconds:60}};
  let decision=limiter.checkRateLimit(req('POST',{}),'models',{rules,nowMs:1000});
  assert.equal(decision.allowed,true);
  assert.equal(decision.remaining,1);

  decision=limiter.checkRateLimit(req('POST',{}),'models',{rules,nowMs:2000});
  assert.equal(decision.allowed,true);
  assert.equal(decision.remaining,0);

  decision=limiter.checkRateLimit(req('POST',{}),'models',{rules,nowMs:3000});
  assert.equal(decision.allowed,false);
  assert.equal(decision.limit,2);
  assert.equal(decision.remaining,0);
  assert.ok(decision.retryAfterSeconds>=1);

  decision=limiter.checkRateLimit(req('POST',{}),'models',{rules,nowMs:61000});
  assert.equal(decision.allowed,true);
  assert.equal(decision.remaining,1);
});

test('different bearer digests and IPs receive separate buckets',()=>{
  const rules={authenticated_write:{limit:1,window_seconds:60}};
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer a','203.0.113.1'),'models',{rules,nowMs:1000}).allowed,true);
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer a','203.0.113.1'),'models',{rules,nowMs:2000}).allowed,false);
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer b','203.0.113.1'),'models',{rules,nowMs:2000}).allowed,true);
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer a','203.0.113.2'),'models',{rules,nowMs:2000}).allowed,true);
});

test('41st authenticated model write returns canonical 429 before validation/upstream',async()=>{
  const original=global.fetch;
  let upstream=0;
  global.fetch=async()=>{upstream+=1;throw new Error('upstream should not be used');};
  try{
    for(let i=1;i<=40;i++){
      const res=makeRes();
      await models(req('POST',{}),res);
      assert.equal(res.statusCode,422);
    }
    const blocked=makeRes();
    await models(req('POST',{}),blocked);
    assert.equal(blocked.statusCode,429);
    assert.deepEqual(json(blocked),{error:{code:'RATE_LIMITED',message:'Too many requests. Retry later.'}});
    assert.equal(blocked.headers['x-ratelimit-limit'],'40');
    assert.equal(blocked.headers['x-ratelimit-remaining'],'0');
    assert.ok(Number(blocked.headers['retry-after'])>=1);
    assert.equal(upstream,0);
  }finally{global.fetch=original;}
});

test('31st anonymous public passport read is blocked before upstream',async()=>{
  const original=global.fetch;
  let upstream=0;
  global.fetch=async()=>{
    upstream+=1;
    return {
      ok:true,
      async json(){
        return {
          passport_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          unique_identifier:'urn:dpp:r05:public',
          status:'active',
          public_payload:{},
          updated_at:'2026-09-19T00:00:00Z'
        };
      }
    };
  };
  const oldUrl=process.env.SUPABASE_URL;
  const oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  try{
    for(let i=1;i<=30;i++){
      const res=makeRes();
      await passport(req('GET',null,{identifier:'urn:dpp:r05:public'},null,'198.51.100.20'),res);
      assert.equal(res.statusCode,200);
    }
    const blocked=makeRes();
    await passport(req('GET',null,{identifier:'urn:dpp:r05:public'},null,'198.51.100.20'),blocked);
    assert.equal(blocked.statusCode,429);
    assert.equal(json(blocked).error.code,'RATE_LIMITED');
    assert.equal(blocked.headers['x-ratelimit-limit'],'30');
    assert.equal(upstream,30);
  }finally{
    global.fetch=original;
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  }
});
