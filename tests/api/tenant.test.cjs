'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/tenant.js');

function makeRes(){
  return {
    statusCode:0,
    headers:{},
    body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}

function makeReq(method,body,auth='Bearer tenant-token'){
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

test('GET requires bearer authentication',async()=>{
  let called=false;
  await withEnvFetch(async()=>{called=true;throw new Error('should not call');},async()=>{
    const res=makeRes();
    await handler(makeReq('GET',null,null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  });
});

test('GET forwards caller bearer to tenant context RPC',async()=>{
  let seen;
  await withEnvFetch(async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {active_organization_id:null,memberships:[]};}};
  },async()=>{
    const res=makeRes();
    await handler(makeReq('GET'),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_tenant_context');
    assert.equal(seen.options.headers.Authorization,'Bearer tenant-token');
    assert.deepEqual(JSON.parse(seen.options.body),{});
  });
});

test('tenant RPC aborts with a stable timeout error when Supabase stalls before headers',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async(_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>{
      const error=new Error('aborted');
      error.name='AbortError';
      reject(error);
    },{once:true});
  });

  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_tenant_context',{},'Bearer tenant-token',env,fetchImpl,5),
    error=>{
      assert.equal(error.status,504);
      assert.equal(error.publicCode,'UPSTREAM_TIMEOUT');
      assert.equal(error.publicMessage,'Database request timed out.');
      return true;
    }
  );
});

test('tenant RPC timeout remains active while Supabase response body stalls',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async(_url,options)=>({
    ok:true,
    json:()=>new Promise((_resolve,reject)=>{
      options.signal.addEventListener('abort',()=>{
        const error=new Error('aborted body');
        error.name='AbortError';
        reject(error);
      },{once:true});
    })
  });

  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_tenant_context',{},'Bearer tenant-token',env,fetchImpl,5),
    error=>{
      assert.equal(error.status,504);
      assert.equal(error.publicCode,'UPSTREAM_TIMEOUT');
      assert.equal(error.publicMessage,'Database request timed out.');
      return true;
    }
  );
});

test('POST rejects malformed organization id without upstream call',async()=>{
  let called=false;
  await withEnvFetch(async()=>{called=true;throw new Error('should not call');},async()=>{
    const res=makeRes();
    await handler(makeReq('POST',{organization_id:'not-a-uuid'}),res);
    assert.equal(res.statusCode,422);
    assert.equal(JSON.parse(res.body).error.code,'INVALID_ORGANIZATION_ID');
    assert.equal(called,false);
  });
});

test('POST switches active tenant through membership-checked RPC',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let seen;
  await withEnvFetch(async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {active_organization_id:id,memberships:[{organization_id:id,role:'owner',active:true}]};}};
  },async()=>{
    const res=makeRes();
    await handler(makeReq('POST',{organization_id:id}),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_tenant_context_set');
    assert.deepEqual(JSON.parse(seen.options.body),{p_organization_id:id});
    assert.equal(JSON.parse(res.body).data.active_organization_id,id);
  });
});

test('non-member tenant switch maps DP102 to stable 403',async()=>{
  await withEnvFetch(async()=>({
    ok:false,
    async json(){return {code:'DP102',message:'internal membership detail'};}
  }),async()=>{
    const res=makeRes();
    await handler(makeReq('POST',{organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,403);
    assert.equal(payload.error.code,'FORBIDDEN');
    assert.equal(res.body.includes('internal membership detail'),false);
  });
});

test('unsupported methods return 405',async()=>{
  const res=makeRes();
  await handler(makeReq('DELETE',{}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET, POST');
});
