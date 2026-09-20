'use strict';
// R04_API_TENANT_ISOLATION_SUBSET_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const models=require('../../api/models.js');
const items=require('../../api/items.js');
const passport=require('../../api/passport.js');
const exportApi=require('../../api/export.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function env(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}
function req(method,body={},query={},auth='Bearer test-token'){
  return {method,body,query,headers:auth?{authorization:auth}:{}};
}
function errorFetch(code,message='sensitive tenant detail'){
  return async()=>({ok:false,async json(){return {code,message};}});
}

test('models API ignores client organization_id tenant injection',async()=>{
  const restore=env(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return {id:'1'};}};};
  try{
    const res=makeRes();
    await models(req('POST',{
      organization_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',
      model_identifier:'SAFE',
      manufacturer_name:'Maker',
      category:'portable',
      canonical_data:{}
    }),res);
    assert.equal(res.statusCode,201);
    const payload=JSON.parse(seen.options.body);
    assert.equal(Object.prototype.hasOwnProperty.call(payload,'organization_id'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload,'p_organization_id'),false);
  }finally{global.fetch=original;restore();}
});

test('items API ignores client organization_id tenant injection',async()=>{
  const restore=env(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return {id:'2'};}};};
  try{
    const res=makeRes();
    await items(req('POST',{
      organization_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',
      model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      unique_identifier:'urn:dpp:r04:item',
      lifecycle_status:'original',
      canonical_data:{}
    }),res);
    assert.equal(res.statusCode,201);
    const payload=JSON.parse(seen.options.body);
    assert.equal(Object.prototype.hasOwnProperty.call(payload,'organization_id'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload,'p_organization_id'),false);
  }finally{global.fetch=original;restore();}
});

test('passport API ignores client organization_id tenant injection',async()=>{
  const restore=env(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return {passport_id:'3',status:'draft'};}};};
  try{
    const res=makeRes();
    await passport(req('POST',{
      organization_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',
      battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      public_payload:{item:{unique_identifier:'urn:dpp:r04:item'}},
      private_payload:{}
    }),res);
    assert.equal(res.statusCode,201);
    const payload=JSON.parse(seen.options.body);
    assert.equal(Object.prototype.hasOwnProperty.call(payload,'organization_id'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload,'p_organization_id'),false);
  }finally{global.fetch=original;restore();}
});

test('export API ignores client tenant selectors and sends empty RPC payload',async()=>{
  const restore=env(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return {organization_id:'active-tenant'};}};};
  try{
    const res=makeRes();
    const request=req('GET',{},{
      organization_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',
      tenant:'other'
    });
    await exportApi(request,res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.options.body,'{}');
  }finally{global.fetch=original;restore();}
});

test('guessed cross-tenant model id is non-enumerating 404',async()=>{
  const restore=env(),original=global.fetch;
  global.fetch=errorFetch('DP205');
  try{
    const res=makeRes();
    await models(req('PATCH',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',model_identifier:'X',expected_updated_at:'2026-09-19T04:00:00.000Z'}),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,404);
    assert.equal(payload.error.code,'MODEL_NOT_FOUND');
    assert.equal(res.body.includes('sensitive tenant detail'),false);
  }finally{global.fetch=original;restore();}
});

test('guessed cross-tenant item id is non-enumerating 404',async()=>{
  const restore=env(),original=global.fetch;
  global.fetch=errorFetch('DP306');
  try{
    const res=makeRes();
    await items(req('DELETE',{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expected_updated_at:'2026-09-20T00:00:00.000Z'}),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,404);
    assert.equal(payload.error.code,'ITEM_NOT_FOUND');
    assert.equal(res.body.includes('sensitive tenant detail'),false);
  }finally{global.fetch=original;restore();}
});

test('guessed cross-tenant private passport id is non-enumerating 404',async()=>{
  const restore=env(),original=global.fetch;
  global.fetch=errorFetch('DP403');
  try{
    const res=makeRes();
    await passport(req('GET',null,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,404);
    assert.equal(payload.error.code,'PASSPORT_NOT_FOUND');
    assert.equal(res.body.includes('sensitive tenant detail'),false);
  }finally{global.fetch=original;restore();}
});

test('export role denial is stable 403 and non-leaking',async()=>{
  const restore=env(),original=global.fetch;
  global.fetch=errorFetch('DP104');
  try{
    const res=makeRes();
    await exportApi(req('GET'),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,403);
    assert.equal(payload.error.code,'FORBIDDEN');
    assert.equal(res.body.includes('sensitive tenant detail'),false);
  }finally{global.fetch=original;restore();}
});

test('public passport response strips private and tenant metadata on upstream drift',async()=>{
  const restore=env(),original=global.fetch;
  global.fetch=async()=>({
    ok:true,
    async json(){
      return {
        passport_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        unique_identifier:'urn:dpp:r04:public',
        status:'active',
        public_payload:{item:{unique_identifier:'urn:dpp:r04:public'}},
        updated_at:'2026-09-19T00:00:00Z',
        private_payload:{secret:'must-not-leak'},
        organization_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        created_by:'ffffffff-ffff-4fff-8fff-ffffffffffff'
      };
    }
  });
  try{
    const res=makeRes();
    await passport(req('GET',null,{identifier:'urn:dpp:r04:public'},null),res);
    const data=JSON.parse(res.body).data;
    assert.equal(res.statusCode,200);
    assert.deepEqual(Object.keys(data).sort(),[
      'passport_id','public_payload','status','unique_identifier','updated_at'
    ].sort());
    assert.equal(Object.prototype.hasOwnProperty.call(data,'private_payload'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(data,'organization_id'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(data,'created_by'),false);
  }finally{global.fetch=original;restore();}
});
