'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/members.js');

const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method,body,auth='Bearer member-token'){
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

test('GET requires bearer authentication before upstream',async()=>{
  let called=false;
  await withEnvFetch(async()=>{called=true;throw new Error('should not call');},async()=>{
    const res=makeRes();
    await handler(req('GET',null,null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  });
});

test('GET forwards bearer to active-tenant member list RPC',async()=>{
  let seen;
  await withEnvFetch(async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return [{user_id:USER,role:'viewer'}];}};
  },async()=>{
    const res=makeRes();
    await handler(req('GET'),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_members_list');
    assert.equal(seen.options.headers.Authorization,'Bearer member-token');
    assert.deepEqual(JSON.parse(seen.options.body),{});
    assert.equal(JSON.parse(res.body).data[0].role,'viewer');
  });
});

test('POST PATCH DELETE route to tenant-scoped member RPCs',async()=>{
  const calls=[];
  await withEnvFetch(async(url,options)=>{
    calls.push({url,payload:JSON.parse(options.body)});
    if(url.endsWith('dpp_api_members_delete')) return {ok:true,async json(){return USER;}};
    return {ok:true,async json(){return {user_id:USER,role:JSON.parse(options.body).p_role||'viewer'};}};
  },async()=>{
    let res=makeRes();
    await handler(req('POST',{user_id:USER,role:'viewer'}),res);
    assert.equal(res.statusCode,201);

    res=makeRes();
    await handler(req('PATCH',{user_id:USER,role:'editor'}),res);
    assert.equal(res.statusCode,200);

    res=makeRes();
    await handler(req('DELETE',{user_id:USER}),res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(JSON.parse(res.body).data,{user_id:USER,deleted:true});
  });
  assert.deepEqual(calls.map(c=>c.url.split('/').pop()),[
    'dpp_api_members_add','dpp_api_members_update','dpp_api_members_delete'
  ]);
  assert.deepEqual(calls[0].payload,{p_user_id:USER,p_role:'viewer'});
  assert.deepEqual(calls[1].payload,{p_user_id:USER,p_role:'editor'});
  assert.deepEqual(calls[2].payload,{p_user_id:USER});
});

test('client organization_id cannot override active tenant member RPC payload',async()=>{
  let seen;
  await withEnvFetch(async(url,options)=>{
    seen={url,payload:JSON.parse(options.body)};
    return {ok:true,async json(){return {user_id:USER,role:'viewer'};}};
  },async()=>{
    const res=makeRes();
    await handler(req('POST',{
      user_id:USER,
      role:'viewer',
      organization_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    }),res);
    assert.equal(res.statusCode,201);
  });
  assert.equal(seen.url.endsWith('/dpp_api_members_add'),true);
  assert.deepEqual(seen.payload,{p_user_id:USER,p_role:'viewer'});
  assert.equal(Object.prototype.hasOwnProperty.call(seen.payload,'organization_id'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(seen.payload,'p_organization_id'),false);
});

test('local role validation rejects owner grant before upstream',async()=>{
  let called=false;
  await withEnvFetch(async()=>{called=true;throw new Error('should not call');},async()=>{
    const res=makeRes();
    await handler(req('POST',{user_id:USER,role:'owner'}),res);
    assert.equal(res.statusCode,422);
    assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
    assert.equal(called,false);
  });
});

test('RBAC denial maps DP104 to stable 403',async()=>{
  await withEnvFetch(async()=>({
    ok:false,
    async json(){return {code:'DP104',message:'internal role detail'};}
  }),async()=>{
    const res=makeRes();
    await handler(req('PATCH',{user_id:USER,role:'editor'}),res);
    assert.equal(res.statusCode,403);
    assert.equal(JSON.parse(res.body).error.code,'FORBIDDEN');
    assert.equal(res.body.includes('internal role detail'),false);
  });
});

test('missing membership maps DP503 to stable 404',async()=>{
  await withEnvFetch(async()=>({
    ok:false,
    async json(){return {code:'DP503',message:'private membership detail'};}
  }),async()=>{
    const res=makeRes();
    await handler(req('DELETE',{user_id:USER}),res);
    assert.equal(res.statusCode,404);
    assert.equal(JSON.parse(res.body).error.code,'MEMBER_NOT_FOUND');
    assert.equal(res.body.includes('private membership detail'),false);
  });
});

test('unsupported methods return 405 with Allow header',async()=>{
  const res=makeRes();
  await handler(req('PUT',{}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET, POST, PATCH, DELETE');
});
