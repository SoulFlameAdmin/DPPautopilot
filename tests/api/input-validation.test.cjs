'use strict';
// R03_API_INPUT_VALIDATION_SUBSET_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const tenant=require('../../api/tenant.js');
const models=require('../../api/models.js');
const items=require('../../api/items.js');
const passport=require('../../api/passport.js');
const request=require('../../api/_request.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method,body,query={},auth='Bearer test-token'){
  return {method,body,query,headers:auth?{authorization:auth}:{}};
}
function assertError(res,status,code){
  assert.equal(res.statusCode,status);
  assert.equal(JSON.parse(res.body).error.code,code);
}
function oversizeObject(){
  return {blob:'x'.repeat(request.MAX_BODY_BYTES+16)};
}

test('shared parser rejects oversized string and Buffer bodies with 413',()=>{
  const huge=JSON.stringify(oversizeObject());
  assert.throws(
    ()=>request.parseBody({body:huge}),
    e=>e.status===413&&e.code==='PAYLOAD_TOO_LARGE'
  );
  assert.throws(
    ()=>request.parseBody({body:Buffer.from(huge,'utf8')}),
    e=>e.status===413&&e.code==='PAYLOAD_TOO_LARGE'
  );
});

test('shared parser rejects malformed JSON and unserializable objects',()=>{
  assert.throws(
    ()=>request.parseBody({body:'{"broken":'}),
    e=>e.status===400&&e.code==='INVALID_JSON'
  );
  const circular={};
  circular.self=circular;
  assert.throws(
    ()=>request.parseBody({body:circular}),
    e=>e.status===400&&e.code==='INVALID_JSON'
  );
});

for(const [name,handler] of [['tenant',tenant],['models',models],['items',items],['passport',passport]]){
  test(`${name} rejects >1 MiB parsed object before upstream DB access`,async()=>{
    const original=global.fetch;
    let called=false;
    global.fetch=async()=>{called=true;throw new Error('upstream must not be called');};
    try{
      const res=makeRes();
      await handler(req('POST',oversizeObject()),res);
      assertError(res,413,'PAYLOAD_TOO_LARGE');
      assert.equal(called,false);
      assert.equal(JSON.parse(res.body).error.message,'Request body exceeds the 1 MiB limit.');
    }finally{global.fetch=original;}
  });
}

test('tenant rejects malformed JSON and invalid organization id locally before upstream',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('upstream must not be called');};
  try{
    let res=makeRes();
    await tenant(req('POST','{"bad":'),res);
    assertError(res,400,'INVALID_JSON');

    res=makeRes();
    await tenant(req('POST',{organization_id:'not-a-uuid'}),res);
    assertError(res,422,'INVALID_ORGANIZATION_ID');

    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('models rejects malformed JSON and oversized/invalid fields locally',async()=>{
  let res=makeRes();
  await models(req('POST','{"bad":'),res);
  assertError(res,400,'INVALID_JSON');

  res=makeRes();
  await models(req('POST',{
    model_identifier:'x'.repeat(129),
    manufacturer_name:'Maker',
    category:'portable',
    canonical_data:{}
  }),res);
  assertError(res,422,'VALIDATION_ERROR');

  res=makeRes();
  await models(req('POST',{
    model_identifier:'M1',
    manufacturer_name:'Maker',
    category:'not-a-category',
    canonical_data:{}
  }),res);
  assertError(res,422,'VALIDATION_ERROR');

  res=makeRes();
  await models(req('POST',{
    model_identifier:'M1',
    manufacturer_name:'Maker',
    category:'portable',
    canonical_data:[]
  }),res);
  assertError(res,422,'VALIDATION_ERROR');
});

test('items rejects invalid IDs, identifier length, lifecycle and JSON shapes locally',async()=>{
  let res=makeRes();
  await items(req('POST',{
    model_id:'bad',
    unique_identifier:'urn:dpp:r03:1',
    lifecycle_status:'original',
    canonical_data:{}
  }),res);
  assertError(res,422,'VALIDATION_ERROR');

  res=makeRes();
  await items(req('POST',{
    model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    unique_identifier:'x'.repeat(301),
    lifecycle_status:'original',
    canonical_data:{}
  }),res);
  assertError(res,422,'VALIDATION_ERROR');

  res=makeRes();
  await items(req('POST',{
    model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    unique_identifier:'urn:dpp:r03:1',
    lifecycle_status:'invalid',
    canonical_data:{}
  }),res);
  assertError(res,422,'VALIDATION_ERROR');

  res=makeRes();
  await items(req('POST',{
    model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    unique_identifier:'urn:dpp:r03:1',
    lifecycle_status:'original',
    canonical_data:[]
  }),res);
  assertError(res,422,'VALIDATION_ERROR');
});

test('passport rejects invalid identifiers, ids, status and payload shapes locally',async()=>{
  let res=makeRes();
  await passport(req('GET',null,{identifier:'x'.repeat(301)},null),res);
  assertError(res,400,'INVALID_IDENTIFIER');

  res=makeRes();
  await passport(req('POST',{
    battery_item_id:'bad',
    public_payload:{},
    private_payload:{}
  }),res);
  assertError(res,422,'VALIDATION_ERROR');

  res=makeRes();
  await passport(req('POST',{
    battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    public_payload:[],
    private_payload:{}
  }),res);
  assertError(res,422,'VALIDATION_ERROR');

  res=makeRes();
  await passport(req('PATCH',{
    id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status:'invalid',
    expected_updated_at:'2026-09-19T04:00:00.000Z'
  }),res);
  assertError(res,422,'VALIDATION_ERROR');
});
