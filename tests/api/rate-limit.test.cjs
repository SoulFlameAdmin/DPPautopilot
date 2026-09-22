'use strict';
// R05_RATE_LIMIT_PRECURSOR_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const limiter=require('../../api/_rate_limit.js');
const models=require('../../api/models.js');
const passport=require('../../api/passport.js');
const tenant=require('../../api/tenant.js');
const organizations=require('../../api/organizations.js');
const members=require('../../api/members.js');
const exportApi=require('../../api/export.js');
const imports=require('../../api/imports.js');
const items=require('../../api/items.js');

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

test('client identity hashes network and bearer material instead of storing raw values',()=>{
  const request=req('GET',null,{},'Bearer super-secret-token','203.0.113.77');
  const auth=limiter._test.authDigest(request);
  const network=limiter._test.networkDigest(request);
  assert.match(auth,/^[0-9a-f]{24}$/);
  assert.match(network,/^[0-9a-f]{32}$/);
  assert.equal(auth.includes('super-secret-token'),false);
  assert.equal(network.includes('203.0.113.77'),false);
  assert.deepEqual(limiter._test.bucketIdentities(request),[
    `network:${network}`,
    `credential:${auth}`
  ]);
});

test('shared backend keys match the DB-safe pseudonymous contract',()=>{
  const request=req('POST',{},{} ,'Bearer shared-secret','203.0.113.90');
  const keys=limiter._test.sharedBucketKeys(request,'models','authenticated_write');
  assert.equal(keys.length,2);
  assert.match(keys[0],/^models\|authenticated_write\|network:[0-9a-f]{32}$/);
  assert.match(keys[1],/^models\|authenticated_write\|credential:[0-9a-f]{24}$/);
  assert.equal(keys.join('|').includes('203.0.113.90'),false);
  assert.equal(keys.join('|').includes('shared-secret'),false);
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

test('rotating bearer or network identity cannot bypass the paired budgets',()=>{
  const rules={authenticated_write:{limit:1,window_seconds:60}};
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer a','203.0.113.1'),'models',{rules,nowMs:1000}).allowed,true);

  // New bearer cannot reset the already-consumed network/IP budget.
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer b','203.0.113.1'),'models',{rules,nowMs:2000}).allowed,false);
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer c','203.0.113.1'),'models',{rules,nowMs:3000}).allowed,false);

  // New IP cannot reset an already-consumed credential budget.
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer a','203.0.113.2'),'models',{rules,nowMs:3000}).allowed,false);

  // A genuinely distinct network + credential pair still has its own budget.
  assert.equal(limiter.checkRateLimit(req('POST',{},{} ,'Bearer d','203.0.113.3'),'models',{rules,nowMs:3000}).allowed,true);
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


test('bucket keys do not retain raw IP or bearer material',()=>{
  const request=req('POST',{},{} ,'Bearer raw-secret-token','203.0.113.77');
  limiter.checkRateLimit(request,'models',{
    rules:{authenticated_write:{limit:2,window_seconds:60}},
    nowMs:1000
  });
  const keys=[...limiter._test.buckets.keys()];
  assert.equal(keys.length,2);
  for(const key of keys){
    assert.equal(key.includes('203.0.113.77'),false);
    assert.equal(key.includes('raw-secret-token'),false);
  }
  assert.ok(keys.some(key=>/^models\|authenticated_write\|network:[0-9a-f]{32}\|0$/.test(key)));
  assert.ok(keys.some(key=>/^models\|authenticated_write\|credential:[0-9a-f]{24}\|0$/.test(key)));
});

test('expired dual buckets are evicted on later windows',()=>{
  const rules={authenticated_write:{limit:2,window_seconds:60}};
  limiter.checkRateLimit(req('POST',{},{} ,'Bearer a','203.0.113.1'),'models',{rules,nowMs:1000,maxBuckets:10});
  limiter.checkRateLimit(req('POST',{},{} ,'Bearer b','203.0.113.2'),'models',{rules,nowMs:2000,maxBuckets:10});
  assert.equal(limiter._test.buckets.size,4);

  limiter.checkRateLimit(req('POST',{},{} ,'Bearer c','203.0.113.3'),'models',{rules,nowMs:61000,maxBuckets:10});
  assert.equal(limiter._test.buckets.size,2);
});

test('bucket map is hard capped during unique-identity flood',()=>{
  const rules={authenticated_write:{limit:5,window_seconds:60}};
  for(let i=1;i<=8;i++){
    limiter.checkRateLimit(
      req('POST',{},{} ,`Bearer token-${i}`,`203.0.113.${i}`),
      'models',
      {rules,nowMs:1000,maxBuckets:3}
    );
  }
  assert.equal(limiter._test.buckets.size,3);
});


test('41st authenticated tenant context write is blocked before validation/upstream',async()=>{
  const originalFetch=global.fetch;
  const originalWarn=console.warn;
  let upstream=0;
  console.warn=()=>{};
  global.fetch=async()=>{upstream+=1;throw new Error('upstream should not be used');};
  try{
    for(let i=1;i<=40;i++){
      const res=makeRes();
      await tenant(req('POST',{organization_id:'not-a-uuid'}),res);
      assert.equal(res.statusCode,422);
      assert.equal(json(res).error.code,'INVALID_ORGANIZATION_ID');
    }
    const blocked=makeRes();
    await tenant(req('POST',{organization_id:'not-a-uuid'}),blocked);
    assert.equal(blocked.statusCode,429);
    assert.equal(json(blocked).error.code,'RATE_LIMITED');
    assert.equal(blocked.headers['x-ratelimit-limit'],'40');
    assert.equal(blocked.headers['x-ratelimit-remaining'],'0');
    assert.ok(Number(blocked.headers['retry-after'])>=1);
    assert.equal(upstream,0);
  }finally{
    global.fetch=originalFetch;
    console.warn=originalWarn;
  }
});


test('active network bucket survives memory-cap credential churn',()=>{
  const rules={authenticated_write:{limit:2,window_seconds:60}};
  const ip='203.0.113.44';

  assert.equal(limiter.checkRateLimit(
    req('POST',{},{} ,'Bearer a',ip),'models',{rules,nowMs:1000,maxBuckets:3}
  ).allowed,true);
  assert.equal(limiter.checkRateLimit(
    req('POST',{},{} ,'Bearer b',ip),'models',{rules,nowMs:2000,maxBuckets:3}
  ).allowed,true);

  const third=limiter.checkRateLimit(
    req('POST',{},{} ,'Bearer c',ip),'models',{rules,nowMs:3000,maxBuckets:3}
  );
  assert.equal(third.allowed,false);
  assert.equal(third.remaining,0);
  assert.equal(limiter._test.buckets.size,3);

  const networkKey=[...limiter._test.buckets.keys()].find(key=>key.includes('|network:'));
  assert.ok(networkKey);
  assert.equal(limiter._test.buckets.get(networkKey).count,3);

  const fourth=limiter.checkRateLimit(
    req('POST',{},{} ,'Bearer d',ip),'models',{rules,nowMs:4000,maxBuckets:3}
  );
  assert.equal(fourth.allowed,false);
  assert.equal(limiter._test.buckets.get(networkKey).count,4);
  assert.equal(limiter._test.buckets.size,3);
});


test('41st authenticated organization write is blocked before validation/upstream',async()=>{
  const originalFetch=global.fetch;
  const originalWarn=console.warn;
  let upstream=0;
  console.warn=()=>{};
  global.fetch=async()=>{upstream+=1;throw new Error('upstream should not be used');};
  try{
    for(let i=1;i<=40;i++){
      const res=makeRes();
      await organizations(req('POST',{name:'',slug:'bad slug'}),res);
      assert.equal(res.statusCode,422);
    }
    const blocked=makeRes();
    await organizations(req('POST',{name:'',slug:'bad slug'}),blocked);
    assert.equal(blocked.statusCode,429);
    assert.equal(json(blocked).error.code,'RATE_LIMITED');
    assert.equal(upstream,0);
  }finally{
    global.fetch=originalFetch;
    console.warn=originalWarn;
  }
});

test('41st authenticated member write is blocked before validation/upstream',async()=>{
  const originalFetch=global.fetch;
  const originalWarn=console.warn;
  let upstream=0;
  console.warn=()=>{};
  global.fetch=async()=>{upstream+=1;throw new Error('upstream should not be used');};
  try{
    for(let i=1;i<=40;i++){
      const res=makeRes();
      await members(req('POST',{user_id:'bad',role:'viewer'}),res);
      assert.equal(res.statusCode,422);
    }
    const blocked=makeRes();
    await members(req('POST',{user_id:'bad',role:'viewer'}),blocked);
    assert.equal(blocked.statusCode,429);
    assert.equal(json(blocked).error.code,'RATE_LIMITED');
    assert.equal(upstream,0);
  }finally{
    global.fetch=originalFetch;
    console.warn=originalWarn;
  }
});


test('feature-gated shared limiter consumes both pseudonymous buckets',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    const index=calls.length;
    return {
      ok:true,
      async json(){
        return [{
          allowed:index===1,
          request_count:index,
          remaining:index===1?1:0,
          reset_epoch_seconds:1900000000,
          retry_after_seconds:index===1?0:12
        }];
      }
    };
  };
  const decision=await limiter.checkSharedRateLimit(
    req('POST',{},{} ,'Bearer shared-runtime','203.0.113.91'),
    'models',
    'Bearer shared-runtime',
    {
      env:{
        DPP_SHARED_RATE_LIMIT_ENABLED:'true',
        DPP_SUPABASE_URL:'https://example.supabase.co',
        DPP_SUPABASE_PUBLISHABLE_KEY:'publishable'
      },
      fetchImpl,
      nowMs:1000
    }
  );
  assert.equal(decision.enforced,true);
  assert.equal(decision.allowed,false);
  assert.equal(decision.remaining,0);
  assert.equal(decision.retryAfterSeconds,12);
  assert.equal(decision.sharedBuckets,2);
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.equal(call.url,'https://example.supabase.co/rest/v1/rpc/dpp_rate_limit_consume');
    assert.equal(call.options.headers.Authorization,'Bearer shared-runtime');
    const body=JSON.parse(call.options.body);
    assert.match(body.p_bucket_key,/^models\|authenticated_write\|(network:[0-9a-f]{32}|credential:[0-9a-f]{24})$/);
    assert.equal(body.p_window_seconds,60);
    assert.equal(body.p_limit,40);
  }
  assert.equal(calls.map(call=>call.options.body).join('|').includes('203.0.113.91'),false);
  assert.equal(calls.map(call=>call.options.body).join('|').includes('shared-runtime'),false);
});

test('shared limiter times out stalled backend and fails closed',async()=>{
  let aborts=0;
  const fetchImpl=async(_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>{
      aborts+=1;
      const error=new Error('raw stalled backend detail');
      error.name='AbortError';
      reject(error);
    },{once:true});
  });
  const decision=await limiter.checkSharedRateLimit(
    req('POST',{},{} ,'Bearer shared-timeout','203.0.113.94'),
    'models',
    'Bearer shared-timeout',
    {
      env:{
        DPP_SHARED_RATE_LIMIT_ENABLED:'true',
        DPP_SUPABASE_URL:'https://example.supabase.co',
        DPP_SUPABASE_PUBLISHABLE_KEY:'publishable'
      },
      fetchImpl,
      timeoutMs:5
    }
  );
  assert.equal(decision.enforced,true);
  assert.equal(decision.allowed,false);
  assert.equal(decision.error,true);
  assert.equal(decision.status,503);
  assert.equal(decision.code,'RATE_LIMIT_BACKEND_UNAVAILABLE');
  assert.equal(aborts,2);
});

test('shared limiter fails closed when its backend is unavailable',async()=>{
  const decision=await limiter.checkSharedRateLimit(
    req('GET',null,{} ,'Bearer shared-runtime','203.0.113.92'),
    'models',
    'Bearer shared-runtime',
    {
      env:{
        DPP_SHARED_RATE_LIMIT_ENABLED:'true',
        DPP_SUPABASE_URL:'https://example.supabase.co',
        DPP_SUPABASE_PUBLISHABLE_KEY:'publishable'
      },
      fetchImpl:async()=>({ok:false,async json(){return {message:'nope'};}})
    }
  );
  assert.equal(decision.enforced,true);
  assert.equal(decision.allowed,false);
  assert.equal(decision.error,true);
  assert.equal(decision.status,503);
  assert.equal(decision.code,'RATE_LIMIT_BACKEND_UNAVAILABLE');
  assert.deepEqual(limiter.sharedRateLimitUnavailableBody(),{
    error:{code:'RATE_LIMIT_BACKEND_UNAVAILABLE',message:'Request protection is temporarily unavailable.'}
  });
});

test('shared limiter is inert unless explicitly enabled and skips public anonymous scope',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls+=1;throw new Error('must not call');};
  const disabled=await limiter.checkSharedRateLimit(
    req('GET',null,{} ,'Bearer a','203.0.113.93'),
    'models',
    'Bearer a',
    {env:{DPP_SHARED_RATE_LIMIT_ENABLED:'false'},fetchImpl}
  );
  assert.equal(disabled.enforced,false);

  const publicDecision=await limiter.checkSharedRateLimit(
    req('GET',null,{identifier:'urn:dpp:r05:public'},'Bearer a','203.0.113.93'),
    'passport',
    'Bearer a',
    {
      env:{
        DPP_SHARED_RATE_LIMIT_ENABLED:'true',
        DPP_SUPABASE_URL:'https://example.supabase.co',
        DPP_SUPABASE_PUBLISHABLE_KEY:'publishable'
      },
      fetchImpl
    }
  );
  assert.equal(publicDecision.enforced,false);
  assert.equal(publicDecision.reason,'public_anonymous_scope');
  assert.equal(calls,0);
});


test('all authenticated API surfaces honor shared limiter 429 before business RPC',async()=>{
  const originalFetch=global.fetch;
  const old={
    enabled:process.env.DPP_SHARED_RATE_LIMIT_ENABLED,
    url:process.env.DPP_SUPABASE_URL,
    key:process.env.DPP_SUPABASE_PUBLISHABLE_KEY
  };
  process.env.DPP_SHARED_RATE_LIMIT_ENABLED='true';
  process.env.DPP_SUPABASE_URL='https://example.supabase.co';
  process.env.DPP_SUPABASE_PUBLISHABLE_KEY='publishable';

  let sharedCalls=0;
  let businessCalls=0;
  global.fetch=async(url)=>{
    if(String(url).includes('/rpc/dpp_rate_limit_consume')){
      sharedCalls+=1;
      return {
        ok:true,
        async json(){
          return [{
            allowed:false,
            request_count:999,
            remaining:0,
            reset_epoch_seconds:1900000000,
            retry_after_seconds:17
          }];
        }
      };
    }
    businessCalls+=1;
    throw new Error('business RPC must not run after shared limiter denial');
  };

  try{
    const cases=[
      ['tenant',tenant,req('GET')],
      ['organizations',organizations,req('GET')],
      ['members',members,req('GET')],
      ['models',models,req('GET')],
      ['items',items,req('GET')],
      ['imports',imports,req('GET')],
      ['export',exportApi,req('GET')],
      ['passport',passport,req('GET',null,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})]
    ];
    for(const [surface,handler,request] of cases){
      limiter._test.resetForTests();
      const before=sharedCalls;
      const res=makeRes();
      await handler(request,res);
      assert.equal(res.statusCode,429,`${surface} shared limiter status`);
      assert.equal(json(res).error.code,'RATE_LIMITED',`${surface} shared limiter code`);
      assert.equal(res.headers['retry-after'],'17',`${surface} shared limiter retry-after`);
      assert.equal(sharedCalls-before,2,`${surface} must consume network + credential shared buckets`);
    }
    assert.equal(businessCalls,0);
  }finally{
    global.fetch=originalFetch;
    if(old.enabled===undefined) delete process.env.DPP_SHARED_RATE_LIMIT_ENABLED; else process.env.DPP_SHARED_RATE_LIMIT_ENABLED=old.enabled;
    if(old.url===undefined) delete process.env.DPP_SUPABASE_URL; else process.env.DPP_SUPABASE_URL=old.url;
    if(old.key===undefined) delete process.env.DPP_SUPABASE_PUBLISHABLE_KEY; else process.env.DPP_SUPABASE_PUBLISHABLE_KEY=old.key;
  }
});
