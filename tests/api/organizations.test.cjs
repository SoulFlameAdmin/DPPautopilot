'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/organizations.js');
const tenantHandler=require('../../api/tenant.js');

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

test('GET organization discovery recovers explicit active tenant through tenant switch',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let activeOrganizationId=null;
  const calls=[];
  await withEnvFetch(async(url,options)=>{
    calls.push({url,options});
    const rpcName=url.split('/').pop();
    const payload=JSON.parse(options.body||'{}');
    if(rpcName==='dpp_api_organizations_list'){
      return {ok:true,async json(){return [{
        organization_id:id,
        name:'Pilot Org',
        slug:'pilot-org',
        role:'owner',
        active:activeOrganizationId===id
      }];}};
    }
    if(rpcName==='dpp_api_tenant_context_set'){
      if(payload.p_organization_id!==id){
        return {ok:false,async json(){return {code:'DP102',message:'not a member'};}};
      }
      activeOrganizationId=id;
      return {ok:true,async json(){return {
        active_organization_id:id,
        memberships:[{organization_id:id,role:'owner',active:true}]
      };}};
    }
    throw new Error('unexpected RPC '+rpcName);
  },async()=>{
    const before=makeRes();
    await handler(req('GET',null),before);
    assert.equal(before.statusCode,200);
    assert.equal(JSON.parse(before.body).data[0].active,false);

    const switched=makeRes();
    await tenantHandler({
      method:'POST',body:{organization_id:id},query:{},headers:{authorization:'Bearer onboarding-token'}
    },switched);
    assert.equal(switched.statusCode,200);
    assert.equal(JSON.parse(switched.body).data.active_organization_id,id);

    const after=makeRes();
    await handler(req('GET',null),after);
    assert.equal(after.statusCode,200);
    assert.equal(JSON.parse(after.body).data[0].active,true);
    assert.equal(calls.filter(call=>call.url.endsWith('/dpp_api_organizations_list')).length,2);
    assert.equal(calls.filter(call=>call.url.endsWith('/dpp_api_tenant_context_set')).length,1);
    assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer onboarding-token'));
  });
});

test('failed non-member tenant switch cannot change discovered active tenant',async()=>{
  const memberId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const outsiderId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let activeOrganizationId=memberId;
  await withEnvFetch(async(url,options)=>{
    const rpcName=url.split('/').pop();
    const payload=JSON.parse(options.body||'{}');
    if(rpcName==='dpp_api_organizations_list'){
      return {ok:true,async json(){return [{
        organization_id:memberId,
        name:'Pilot Org',slug:'pilot-org',role:'owner',active:activeOrganizationId===memberId
      }];}};
    }
    if(rpcName==='dpp_api_tenant_context_set'){
      if(payload.p_organization_id===outsiderId){
        return {ok:false,async json(){return {code:'DP102',message:'private membership detail'};}};
      }
      throw new Error('unexpected tenant switch');
    }
    throw new Error('unexpected RPC '+rpcName);
  },async()=>{
    const denied=makeRes();
    await tenantHandler({
      method:'POST',body:{organization_id:outsiderId},query:{},headers:{authorization:'Bearer onboarding-token'}
    },denied);
    assert.equal(denied.statusCode,403);
    assert.equal(JSON.parse(denied.body).error.code,'FORBIDDEN');
    assert.equal(denied.body.includes('private membership detail'),false);

    const after=makeRes();
    await handler(req('GET',null),after);
    assert.equal(after.statusCode,200);
    assert.equal(JSON.parse(after.body).data[0].active,true);
    assert.equal(activeOrganizationId,memberId);
  });
});

test('organization RPC network failure maps to stable 502 without leaking transport detail',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_organizations_list',{},'Bearer onboarding-token',env,async()=>{throw new Error('socket reset private transport detail');},50),
    error=>{
      assert.equal(error.status,502);
      assert.equal(error.publicCode,'UPSTREAM_ERROR');
      assert.equal(error.publicMessage,'Database request failed.');
      assert.equal(String(error).includes('private transport detail'),false);
      return true;
    }
  );
});

test('organization RPC aborts with a stable timeout error when Supabase stalls',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async(_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>{
      const error=new Error('aborted');
      error.name='AbortError';
      reject(error);
    },{once:true});
  });
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_organizations_list',{},'Bearer onboarding-token',env,fetchImpl,5),
    error=>{
      assert.equal(error.status,504);
      assert.equal(error.publicCode,'UPSTREAM_TIMEOUT');
      assert.equal(error.publicMessage,'Database request timed out.');
      return true;
    }
  );
});

test('organization RPC timeout remains active while Supabase response body stalls',async()=>{
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
    ()=>handler._test.rpc('dpp_api_organizations_list',{},'Bearer onboarding-token',env,fetchImpl,5),
    error=>{
      assert.equal(error.status,504);
      assert.equal(error.publicCode,'UPSTREAM_TIMEOUT');
      assert.equal(error.publicMessage,'Database request timed out.');
      return true;
    }
  );
});

test('organization RPC rejects malformed successful upstream JSON',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async()=>({
    ok:true,
    async json(){throw new SyntaxError('malformed json');}
  });
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_organizations_list',{},'Bearer onboarding-token',env,fetchImpl,50),
    error=>{
      assert.equal(error.status,502);
      assert.equal(error.publicCode,'UPSTREAM_ERROR');
      assert.equal(error.publicMessage,'Database request failed.');
      assert.equal(String(error).includes('malformed json'),false);
      return true;
    }
  );
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

test('GET fails closed when successful organization RPC returns malformed shape',async()=>{
  await withEnvFetch(async()=>({
    ok:true,
    async json(){return [{organization_id:'not-a-uuid',name:'Leaked',slug:'pilot-org',role:'owner',active:true}];}
  }),async()=>{
    const res=makeRes();
    await handler(req('GET',null),res);
    const body=JSON.parse(res.body);
    assert.equal(res.statusCode,502);
    assert.equal(body.error.code,'UPSTREAM_ERROR');
    assert.equal(res.body.includes('Leaked'),false);
  });
});

test('POST fails closed when organization create RPC omits required tenant fields',async()=>{
  await withEnvFetch(async()=>({
    ok:true,
    async json(){return {organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Pilot Org',slug:'pilot-org'};}
  }),async()=>{
    const res=makeRes();
    await handler(req('POST',{name:'Pilot Org',slug:'pilot-org'}),res);
    assert.equal(res.statusCode,502);
    assert.equal(JSON.parse(res.body).error.code,'UPSTREAM_ERROR');
  });
});
