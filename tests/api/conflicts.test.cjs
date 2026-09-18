'use strict';
// M23_API_WRITE_CONFLICT_SUBSET_PASS

const test=require('node:test');
const assert=require('node:assert/strict');
const models=require('../../api/models.js');
const items=require('../../api/items.js');
const passport=require('../../api/passport.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
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
function mockConflict(message='internal database detail'){
  return async()=>({ok:false,async json(){return {code:'23505',message};}});
}

test('duplicate model write maps to stable 409 MODEL_CONFLICT',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=mockConflict('duplicate model detail');
  try{
    const req={
      method:'POST',
      body:{model_identifier:'M-1',manufacturer_name:'Maker',category:'portable',canonical_data:{}},
      query:{},headers:{authorization:'Bearer test-token'}
    };
    const res=makeRes();
    await models(req,res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,409);
    assert.deepEqual(payload.error,{
      code:'MODEL_CONFLICT',
      message:'The battery model conflicts with an existing record.'
    });
    assert.equal(res.body.includes('duplicate model detail'),false);
  }finally{global.fetch=original;restore();}
});

test('duplicate battery item write maps to stable 409 ITEM_CONFLICT',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=mockConflict('duplicate item detail');
  try{
    const req={
      method:'POST',
      body:{
        model_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        unique_identifier:'urn:dpp:m23:api:item',
        lifecycle_status:'original',
        canonical_data:{}
      },
      query:{},headers:{authorization:'Bearer test-token'}
    };
    const res=makeRes();
    await items(req,res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,409);
    assert.deepEqual(payload.error,{
      code:'ITEM_CONFLICT',
      message:'The battery item conflicts with an existing record.'
    });
    assert.equal(res.body.includes('duplicate item detail'),false);
  }finally{global.fetch=original;restore();}
});

test('duplicate passport write maps to stable 409 PASSPORT_CONFLICT',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=mockConflict('duplicate passport detail');
  try{
    const req={
      method:'POST',
      body:{
        battery_item_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        public_payload:{item:{unique_identifier:'urn:dpp:m23:api:item'}},
        private_payload:{}
      },
      query:{},headers:{authorization:'Bearer test-token'}
    };
    const res=makeRes();
    await passport(req,res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,409);
    assert.deepEqual(payload.error,{
      code:'PASSPORT_CONFLICT',
      message:'The passport conflicts with an existing record.'
    });
    assert.equal(res.body.includes('duplicate passport detail'),false);
  }finally{global.fetch=original;restore();}
});

test('unexpected database errors fail closed to 502 without DB detail leakage',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'XX999',message:'sensitive internal error'};}});
  try{
    const req={
      method:'POST',
      body:{model_identifier:'M-2',manufacturer_name:'Maker',category:'portable',canonical_data:{}},
      query:{},headers:{authorization:'Bearer test-token'}
    };
    const res=makeRes();
    await models(req,res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,502);
    assert.deepEqual(payload.error,{code:'UPSTREAM_ERROR',message:'Database request failed.'});
    assert.equal(res.body.includes('sensitive internal error'),false);
  }finally{global.fetch=original;restore();}
});
