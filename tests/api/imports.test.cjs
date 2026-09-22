'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/imports.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function makeReq(method,body,query,auth='Bearer test-token'){
  return {method,body,query:query||{},headers:auth?{authorization:auth}:{}};
}
function withEnv(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}

test('missing bearer auth is rejected before upstream access',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(makeReq('GET',null,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('POST stages normalized rows through secure import create RPC',async()=>{
  const restore=withEnv(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {import_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'staged',staged_rows:1};}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('POST',{
      mapping_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      rows:[{
        normalized_model:{model_identifier:'M1',manufacturer_name:'Maker',category:'portable'},
        normalized_item:{unique_identifier:'urn:dpp:import:1'},
        validation_errors:[]
      }]
    }),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_import_create');
    assert.equal(seen.options.headers.Authorization,'Bearer test-token');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_rows:[{
        normalized_model:{model_identifier:'M1',manufacturer_name:'Maker',category:'portable'},
        normalized_item:{unique_identifier:'urn:dpp:import:1'},
        validation_errors:[]
      }],
      p_mapping_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    });
  }finally{global.fetch=original;restore();}
});

test('POST rejects malformed rows and mapping id locally',async()=>{
  let res=makeRes();
  await handler(makeReq('POST',{rows:[]}),res);
  assert.equal(res.statusCode,422);
  assert.equal(JSON.parse(res.body).error.code,'INVALID_IMPORT_PAYLOAD');

  res=makeRes();
  await handler(makeReq('POST',{
    rows:[{normalized_model:[],normalized_item:{}}],
    mapping_id:null
  }),res);
  assert.equal(res.statusCode,422);

  res=makeRes();
  await handler(makeReq('POST',{
    rows:[{normalized_model:{},normalized_item:{}}],
    mapping_id:'bad'
  }),res);
  assert.equal(res.statusCode,422);
});

test('GET requires a valid import UUID and forwards secure status read',async()=>{
  let res=makeRes();
  await handler(makeReq('GET',null,{id:'bad'}),res);
  assert.equal(res.statusCode,400);
  assert.equal(JSON.parse(res.body).error.code,'INVALID_IMPORT_ID');

  const restore=withEnv(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {import_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'validated'};}};
  };
  try{
    res=makeRes();
    await handler(makeReq('GET',null,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_import_get');
    assert.deepEqual(JSON.parse(seen.options.body),{p_import_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
  }finally{global.fetch=original;restore();}
});

for(const action of ['validate','commit']){
  test(`PATCH ${action} forwards to the matching secure RPC`,async()=>{
    const restore=withEnv(),original=global.fetch;
    let seen;
    global.fetch=async(url,options)=>{
      seen={url,options};
      return {ok:true,async json(){return {import_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:action==='validate'?'validated':'committed'};}};
    };
    try{
      const res=makeRes();
      await handler(makeReq('PATCH',{
        id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        action
      }),res);
      assert.equal(res.statusCode,200);
      assert.equal(seen.url,`https://example.supabase.co/rest/v1/rpc/dpp_api_import_${action}`);
      assert.deepEqual(JSON.parse(seen.options.body),{p_import_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
    }finally{global.fetch=original;restore();}
  });
}

test('PATCH rejects invalid action locally',async()=>{
  const res=makeRes();
  await handler(makeReq('PATCH',{
    id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    action:'delete'
  }),res);
  assert.equal(res.statusCode,422);
  assert.equal(JSON.parse(res.body).error.code,'INVALID_IMPORT_ACTION');
});

test('DP001 cross-tenant/missing import maps to stable non-leaking 404',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP001',message:'tenant/internal detail'};}});
  try{
    const res=makeRes();
    await handler(makeReq('GET',null,{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,404);
    assert.equal(payload.error.code,'IMPORT_NOT_FOUND');
    assert.equal(payload.error.message,'The import was not found.');
    assert.equal(res.body.includes('tenant/internal detail'),false);
  }finally{global.fetch=original;restore();}
});

test('DP003 and DP008 map to stable conflict semantics',async()=>{
  const restore=withEnv(),original=global.fetch;
  try{
    global.fetch=async()=>({ok:false,async json(){return {code:'DP003',message:'secret'};}});
    let res=makeRes();
    await handler(makeReq('PATCH',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',action:'commit'}),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'IMPORT_NOT_COMMITTABLE');

    global.fetch=async()=>({ok:false,async json(){return {code:'DP008',message:'duplicate secret'};}});
    res=makeRes();
    await handler(makeReq('PATCH',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',action:'commit'}),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'DUPLICATE_BATTERY_IDENTIFIER');
  }finally{global.fetch=original;restore();}
});

test('DP009/DP010 preserve validation/not-found semantics',async()=>{
  const restore=withEnv(),original=global.fetch;
  try{
    global.fetch=async()=>({ok:false,async json(){return {code:'DP009'};}});
    let res=makeRes();
    await handler(makeReq('POST',{
      rows:[{normalized_model:{},normalized_item:{}}]
    }),res);
    assert.equal(res.statusCode,422);
    assert.equal(JSON.parse(res.body).error.code,'INVALID_IMPORT_PAYLOAD');

    global.fetch=async()=>({ok:false,async json(){return {code:'DP010'};}});
    res=makeRes();
    await handler(makeReq('POST',{
      mapping_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      rows:[{normalized_model:{},normalized_item:{}}]
    }),res);
    assert.equal(res.statusCode,404);
    assert.equal(JSON.parse(res.body).error.code,'IMPORT_MAPPING_NOT_FOUND');
  }finally{global.fetch=original;restore();}
});

test('unsupported method returns 405',async()=>{
  const res=makeRes();
  await handler(makeReq('DELETE',{}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET, POST, PATCH');
});


test('M20 import RPC network failure maps to stable 502 without leaking transport detail',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_import_get',{},'Bearer import-token',env,async()=>{throw new Error('socket reset private transport detail');},50),
    error=>{
      assert.equal(error.status,502);
      assert.equal(error.publicCode,'UPSTREAM_ERROR');
      assert.equal(error.publicMessage,'Database request failed.');
      assert.equal(String(error).includes('private transport detail'),false);
      return true;
    }
  );
});

test('M20 import RPC times out while upstream response body stalls', async () => {
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
    ()=>handler._test.rpc('dpp_api_import_get',{},'Bearer test-token',env,fetchImpl,5),
    error=>{
      assert.equal(error.status,504);
      assert.equal(error.publicCode,'UPSTREAM_TIMEOUT');
      assert.equal(error.publicMessage,'Database request timed out.');
      return true;
    }
  );
});

test('M20 import RPC rejects malformed successful upstream JSON', async () => {
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
  const fetchImpl=async()=>({
    ok:true,
    async json(){throw new SyntaxError('malformed upstream json');}
  });
  await assert.rejects(
    ()=>handler._test.rpc('dpp_api_import_get',{},'Bearer test-token',env,fetchImpl,50),
    error=>{
      assert.equal(error.status,502);
      assert.equal(error.publicCode,'UPSTREAM_ERROR');
      assert.equal(error.publicMessage,'Database request failed.');
      assert.equal(String(error).includes('malformed upstream json'),false);
      return true;
    }
  );
});
