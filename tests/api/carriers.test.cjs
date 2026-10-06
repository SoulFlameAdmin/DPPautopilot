'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/carriers.js');

function res(){
  return {statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},end(v){this.body=v||'';}};
}
function req(method,body={},query={},auth='Bearer test-token'){
  return {method,body,query,headers:auth?{authorization:auth}:{}};
}
function env(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=oldKey;};
}

test('carrier API requires authentication',async()=>{
  const out=res();await handler(req('GET',{}, {},null),out);
  assert.equal(out.statusCode,401);
  assert.equal(JSON.parse(out.body).error.code,'AUTH_REQUIRED');
});

test('POST binds through secure carrier RPC without accepting a public URL',async()=>{
  const restore=env(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',carrier_kind:'qr',status:'active'};}}};
  try{
    const out=res();await handler(req('POST',{battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',carrier_kind:'qr'}),out);
    assert.equal(out.statusCode,201);
    assert.match(seen.url,/dpp_api_carrier_bind_secure$/);
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_carrier_kind:'qr',
      p_nfc_technology:null,
      p_external_uid:null
    });
  }finally{global.fetch=original;restore();}
});

test('GET history calls tenant-scoped scan history RPC',async()=>{
  const restore=env(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return [];}}};
  try{
    const out=res();await handler(req('GET',{}, {history:'1',battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',limit:'25'}),out);
    assert.equal(out.statusCode,200);
    assert.match(seen.url,/dpp_api_carrier_scan_history$/);
    assert.deepEqual(JSON.parse(seen.options.body),{p_battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',p_limit:25});
  }finally{global.fetch=original;restore();}
});

test('PATCH revokes an active carrier',async()=>{
  const restore=env(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'revoked'};}}};
  try{
    const out=res();await handler(req('PATCH',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',action:'revoke',reason:'operator reissue'}),out);
    assert.equal(out.statusCode,200);
    assert.match(seen.url,/dpp_api_carrier_revoke$/);
  }finally{global.fetch=original;restore();}
});

test('NFC binding requires supported technology and invalid history limit fails locally',async()=>{
  let out=res();await handler(req('POST',{battery_item_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',carrier_kind:'nfc'}),out);
  assert.equal(out.statusCode,422);
  assert.deepEqual(JSON.parse(out.body).error,{code:'VALIDATION_ERROR',message:'The request failed validation.'});
  out=res();await handler(req('GET',{}, {history:'1',limit:'999'}),out);
  assert.equal(out.statusCode,422);
  assert.deepEqual(JSON.parse(out.body).error,{code:'VALIDATION_ERROR',message:'The request failed validation.'});
});
