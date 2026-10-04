'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/batch-provision.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function makeReq(method='POST',body={},auth='Bearer batch-token'){
  return {method,body,query:{},headers:{...(auth?{authorization:auth}:{}),'x-forwarded-for':'203.0.113.88'}};
}
function publicTemplate(){
  return {model:{identification:{category:'light_means_of_transport',model_id:'LMT-48V-20AH'}},item:{}};
}
function generatedBody(overrides={}){
  return {
    model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    batch_key:'BATCH-2026-10-A',
    generator:{
      quantity:3,
      identifier_prefix:'BAT-LMT-',
      serial_start:1,
      serial_width:6,
      item_canonical_data_template:{chemistry:'NMC'},
      public_payload_template:publicTemplate(),
      private_payload_template:{item:{state_of_health:{remaining_capacity:20}}}
    },
    ...overrides
  };
}
function unitResult(identifier,position,overrides={}){
  return {
    position,
    item_id:(position===1?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1':position===2?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'),
    passport_id:(position===1?'cccccccc-cccc-4ccc-8ccc-ccccccccccc1':position===2?'cccccccc-cccc-4ccc-8ccc-ccccccccccc2':'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'),
    model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    unique_identifier:identifier,
    lifecycle_status:'original',
    passport_status:'active',
    public_payload:{model:{identification:{category:'light_means_of_transport'}},item:{unique_identifier:identifier}},
    created_item:true,created_passport:true,idempotent_replay:false,
    created_at:'2026-10-04T14:30:00.000Z',
    updated_at:'2026-10-04T14:30:00.000Z',
    ...overrides
  };
}
function resultFixture(overrides={}){
  return {
    batch_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    batch_key:'BATCH-2026-10-A',
    model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    quantity:3,
    created_batch:true,
    idempotent_replay:false,
    created_at:'2026-10-04T14:30:00.000Z',
    units:[
      unitResult('BAT-LMT-000001',1),
      unitResult('BAT-LMT-000002',2),
      unitResult('BAT-LMT-000003',3)
    ],
    ...overrides
  };
}
function withEnv(){
  const old={url:process.env.DPP_SUPABASE_URL,key:process.env.DPP_SUPABASE_PUBLISHABLE_KEY,origin:process.env.DPP_PUBLIC_ORIGIN,shared:process.env.DPP_SHARED_RATE_LIMIT_ENABLED};
  process.env.DPP_SUPABASE_URL='https://example.supabase.co';
  process.env.DPP_SUPABASE_PUBLISHABLE_KEY='publishable-key';
  process.env.DPP_PUBLIC_ORIGIN='https://dpp.example';
  process.env.DPP_SHARED_RATE_LIMIT_ENABLED='false';
  return ()=>{
    const vals={DPP_SUPABASE_URL:old.url,DPP_SUPABASE_PUBLISHABLE_KEY:old.key,DPP_PUBLIC_ORIGIN:old.origin,DPP_SHARED_RATE_LIMIT_ENABLED:old.shared};
    for(const [k,v] of Object.entries(vals)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  };
}

test('missing bearer is rejected before batch RPC',async()=>{
  const original=global.fetch;let called=false;global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();await handler(makeReq('POST',generatedBody(),null),res);
    assert.equal(res.statusCode,401);assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('Produce X generator creates deterministic serial range and calls one atomic batch RPC',async()=>{
  const restore=withEnv(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return resultFixture();}};};
  try{
    const res=makeRes();await handler(makeReq('POST',generatedBody()),res);
    assert.equal(res.statusCode,201);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_scooter_battery_batch_provision');
    const sent=JSON.parse(seen.options.body);
    assert.equal(sent.p_batch_key,'BATCH-2026-10-A');
    assert.equal(sent.p_units.length,3);
    assert.deepEqual(sent.p_units.map(x=>x.unique_identifier),['BAT-LMT-000001','BAT-LMT-000002','BAT-LMT-000003']);
    assert.deepEqual(sent.p_units.map(x=>x.item_canonical_data.production.serial_number),['000001','000002','000003']);
    assert.ok(sent.p_units.every(x=>x.item_canonical_data.production.batch_key==='BATCH-2026-10-A'));
    assert.deepEqual(sent.p_units.map(x=>x.public_payload.item.unique_identifier),['BAT-LMT-000001','BAT-LMT-000002','BAT-LMT-000003']);
    const data=JSON.parse(res.body).data;
    assert.equal(data.quantity,3);
    assert.equal(data.units[0].passport_url,'https://dpp.example/passport?identifier=BAT-LMT-000001');
    assert.equal(data.units[2].qr_url,'https://dpp.example/qr?identifier=BAT-LMT-000003');
  }finally{global.fetch=original;restore();}
});

test('explicit batch rejects duplicate identifiers before upstream',async()=>{
  const original=global.fetch;let called=false;global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const unit={unique_identifier:'BAT-X',item_canonical_data:{},public_payload:{model:{identification:{category:'light_means_of_transport'}},item:{unique_identifier:'BAT-X'}},private_payload:{}};
    const res=makeRes();
    await handler(makeReq('POST',{model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',batch_key:'BATCH-X',units:[unit,JSON.parse(JSON.stringify(unit))]}),res);
    assert.equal(res.statusCode,422);assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('generator validates quantity serial width and range without partial work',async()=>{
  for(const generator of [
    {...generatedBody().generator,quantity:251},
    {...generatedBody().generator,serial_width:0},
    {...generatedBody().generator,serial_start:999999,serial_width:6,quantity:2}
  ]){
    const res=makeRes();
    await handler(makeReq('POST',generatedBody({generator})),res);
    assert.equal(res.statusCode,422);
  }
});

test('restricted public fields and authority-only organisation payload fail closed',async()=>{
  const original=global.fetch;let called=false;global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    let body=generatedBody();body.generator.public_payload_template.model.restricted_composition={cathode:'secret'};
    let res=makeRes();await handler(makeReq('POST',body),res);assert.equal(res.statusCode,422);

    body=generatedBody();body.generator.private_payload_template.model={compliance_test_reports:[{document_ref:'secret'}]};
    res=makeRes();await handler(makeReq('POST',body),res);assert.equal(res.statusCode,403);assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('identical batch replay returns 200 and same identities',async()=>{
  const restore=withEnv(),original=global.fetch;
  const replay=resultFixture({created_batch:false,idempotent_replay:true,units:[
    unitResult('BAT-LMT-000001',1,{created_item:false,created_passport:false,idempotent_replay:true}),
    unitResult('BAT-LMT-000002',2,{created_item:false,created_passport:false,idempotent_replay:true}),
    unitResult('BAT-LMT-000003',3,{created_item:false,created_passport:false,idempotent_replay:true})
  ]});
  global.fetch=async()=>({ok:true,async json(){return replay;}});
  try{
    const res=makeRes();await handler(makeReq('POST',generatedBody()),res);
    assert.equal(res.statusCode,200);assert.equal(JSON.parse(res.body).data.idempotent_replay,true);
  }finally{global.fetch=original;restore();}
});

test('divergent batch-key conflict maps to stable public error',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP606',message:'internal batch fingerprint mismatch'};}});
  try{
    const res=makeRes();await handler(makeReq('POST',generatedBody()),res);
    assert.equal(res.statusCode,409);assert.equal(JSON.parse(res.body).error.code,'BATCH_KEY_CONFLICT');
    assert.equal(res.body.includes('fingerprint'),false);
  }finally{global.fetch=original;restore();}
});

test('successful RPC with malformed batch shape fails closed',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:true,async json(){return {batch_id:'bad',quantity:3,units:[]};}});
  try{
    const res=makeRes();await handler(makeReq('POST',generatedBody()),res);
    assert.equal(res.statusCode,502);assert.equal(JSON.parse(res.body).error.code,'UPSTREAM_ERROR');
  }finally{global.fetch=original;restore();}
});

test('unsupported methods return 405 and canonical origin is HTTPS-only',async()=>{
  const res=makeRes();await handler(makeReq('GET',null),res);
  assert.equal(res.statusCode,405);assert.equal(res.headers.allow,'POST');
  assert.equal(handler._test.canonicalOrigin({DPP_PUBLIC_ORIGIN:'https://dpp.example'}),'https://dpp.example');
  assert.throws(()=>handler._test.canonicalOrigin({DPP_PUBLIC_ORIGIN:'http://dpp.example'}),/PUBLIC_ORIGIN_INVALID/);
});
