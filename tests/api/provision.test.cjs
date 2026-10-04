'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/provision.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function makeReq(method='POST',body={},auth='Bearer provision-token'){
  return {
    method,body,query:{},
    headers:{
      ...(auth?{authorization:auth}:{}),
      'x-forwarded-for':'203.0.113.77'
    }
  };
}
function resultFixture(overrides={}){
  return {
    item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    passport_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    unique_identifier:'BAT-LMT-000001',
    lifecycle_status:'original',
    passport_status:'draft',
    activation_required:true,
    public_payload:{
      model:{identification:{category:'light_means_of_transport',model_id:'LMT-48V-20AH'}},
      item:{unique_identifier:'BAT-LMT-000001'}
    },
    created_item:true,
    created_passport:true,
    idempotent_replay:false,
    created_at:'2026-10-04T05:30:00.000Z',
    updated_at:'2026-10-04T05:30:00.000Z',
    ...overrides
  };
}
function validBody(overrides={}){
  return {
    model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    unique_identifier:'BAT-LMT-000001',
    item_canonical_data:{serial:'SER-000001'},
    public_payload:{
      model:{identification:{category:'light_means_of_transport',model_id:'LMT-48V-20AH'}},
      item:{unique_identifier:'BAT-LMT-000001'}
    },
    private_payload:{item:{state_of_health:{percent:100}}},
    ...overrides
  };
}
function withEnv(){
  const old={
    url:process.env.DPP_SUPABASE_URL,
    key:process.env.DPP_SUPABASE_PUBLISHABLE_KEY,
    origin:process.env.DPP_PUBLIC_ORIGIN,
    shared:process.env.DPP_SHARED_RATE_LIMIT_ENABLED
  };
  process.env.DPP_SUPABASE_URL='https://example.supabase.co';
  process.env.DPP_SUPABASE_PUBLISHABLE_KEY='publishable-key';
  process.env.DPP_PUBLIC_ORIGIN='https://dpp.example';
  process.env.DPP_SHARED_RATE_LIMIT_ENABLED='false';
  return ()=>{
    for(const [name,value] of Object.entries({
      DPP_SUPABASE_URL:old.url,
      DPP_SUPABASE_PUBLISHABLE_KEY:old.key,
      DPP_PUBLIC_ORIGIN:old.origin,
      DPP_SHARED_RATE_LIMIT_ENABLED:old.shared
    })){
      if(value===undefined) delete process.env[name]; else process.env[name]=value;
    }
  };
}

test('missing bearer is rejected before provisioning RPC',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(makeReq('POST',validBody(),null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('POST atomically provisions a draft battery passport and returns canonical carrier URLs',async()=>{
  const restore=withEnv(), original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return resultFixture();}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('POST',validBody()),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_scooter_battery_provision');
    assert.equal(seen.options.headers.Authorization,'Bearer provision-token');
    const sent=JSON.parse(seen.options.body);
    assert.equal(sent.p_model_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(sent.p_unique_identifier,'BAT-LMT-000001');
    assert.deepEqual(sent.p_item_canonical_data,{serial:'SER-000001'});
    const data=JSON.parse(res.body).data;
    assert.equal(data.passport_status,'draft');
    assert.equal(data.activation_required,true);
    assert.equal(data.passport_url,'https://dpp.example/passport?identifier=BAT-LMT-000001');
    assert.equal(data.qr_url,'https://dpp.example/qr?identifier=BAT-LMT-000001');
    assert.equal(data.qr_api_url,'https://dpp.example/api/qr?identifier=BAT-LMT-000001');
  }finally{global.fetch=original;restore();}
});

test('identical retry returns the same provisioned identity with 200',async()=>{
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:true,async json(){return resultFixture({
    created_item:false,created_passport:false,idempotent_replay:true
  });}});
  try{
    const res=makeRes();
    await handler(makeReq('POST',validBody()),res);
    assert.equal(res.statusCode,200);
    const data=JSON.parse(res.body).data;
    assert.equal(data.idempotent_replay,true);
    assert.equal(data.item_id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    assert.equal(data.passport_id,'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  }finally{global.fetch=original;restore();}
});

test('invalid model id and identifier are rejected locally',async()=>{
  let res=makeRes();
  await handler(makeReq('POST',validBody({model_id:'bad'})),res);
  assert.equal(res.statusCode,422);
  assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');

  res=makeRes();
  await handler(makeReq('POST',validBody({unique_identifier:'bad\nidentifier'})),res);
  assert.equal(res.statusCode,422);
});

test('public payload must carry the exact individual battery identifier',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    const body=validBody();
    body.public_payload.item.unique_identifier='BAT-LMT-WRONG';
    await handler(makeReq('POST',body),res);
    assert.equal(res.statusCode,422);
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('non-LMT public category is rejected locally',async()=>{
  const res=makeRes();
  const body=validBody();
  body.public_payload.model.identification.category='electric_vehicle';
  await handler(makeReq('POST',body),res);
  assert.equal(res.statusCode,422);
  assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
});

test('restricted fields cannot enter public payload and authority-only fields cannot enter organization private payload',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    let body=validBody();
    body.public_payload.model.restricted_composition={cathode:'secret'};
    let res=makeRes();
    await handler(makeReq('POST',body),res);
    assert.equal(res.statusCode,422);
    assert.equal(called,false);

    body=validBody();
    body.private_payload.model={compliance_test_reports:[{document_ref:'secret'}]};
    res=makeRes();
    await handler(makeReq('POST',body),res);
    assert.equal(res.statusCode,403);
    assert.equal(JSON.parse(res.body).error.code,'FORBIDDEN');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('database provisioning conflicts map to stable public errors without detail leak',async()=>{
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP604',message:'internal conflicting tenant detail'};}});
  try{
    const res=makeRes();
    await handler(makeReq('POST',validBody()),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'BATTERY_IDENTIFIER_CONFLICT');
    assert.equal(res.body.includes('internal conflicting tenant detail'),false);
  }finally{global.fetch=original;restore();}
});

test('successful RPC with malformed shape fails closed',async()=>{
  const restore=withEnv(), original=global.fetch;
  global.fetch=async()=>({ok:true,async json(){return {item_id:'not-a-uuid',passport_status:'active'};}});
  try{
    const res=makeRes();
    await handler(makeReq('POST',validBody()),res);
    assert.equal(res.statusCode,502);
    assert.equal(JSON.parse(res.body).error.code,'UPSTREAM_ERROR');
  }finally{global.fetch=original;restore();}
});

test('unsupported methods return 405 with POST allow header',async()=>{
  const res=makeRes();
  await handler(makeReq('GET',null),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'POST');
});

test('canonical origin remains HTTPS-only',()=>{
  assert.equal(handler._test.canonicalOrigin({DPP_PUBLIC_ORIGIN:'https://dpp.example'}),'https://dpp.example');
  assert.throws(()=>handler._test.canonicalOrigin({DPP_PUBLIC_ORIGIN:'http://dpp.example'}),/PUBLIC_ORIGIN_INVALID/);
});
