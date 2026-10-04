'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/imports.js');

function makeRes(){
  return {statusCode:0,headers:{},body:'',setHeader(n,v){this.headers[String(n).toLowerCase()]=v;},end(v){this.body=v||'';}};
}
function makeReq(query){
  return {method:'GET',body:null,query,headers:{authorization:'Bearer test-token'}};
}
function withEnv(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=oldKey;};
}

test('Stage 6 import error report uses tenant-scoped RPC and validates shape',async()=>{
  const restore=withEnv(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      import_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status:'invalid',
      row_count:2,
      error_count:1,
      rows:[{row_number:2,model_identifier:'LMT-1',unique_identifier:'BAT-2',validation_errors:['unique_identifier already exists']}]
    };}};
  };
  try{
    const res=makeRes();
    await handler(makeReq({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',detail:'errors'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_import_errors');
    const data=JSON.parse(res.body).data;
    assert.equal(data.error_count,1);
    assert.equal(data.rows[0].row_number,2);
  }finally{global.fetch=original;restore();}
});

test('Stage 6 import error shape fails closed on malformed rows',()=>{
  assert.equal(handler._test.validImportErrors({
    import_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status:'invalid',row_count:1,error_count:1,
    rows:[{row_number:1,model_identifier:'M',unique_identifier:'B',validation_errors:['bad']}]
  }),true);
  assert.equal(handler._test.validImportErrors({
    import_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status:'invalid',row_count:1,error_count:1,
    rows:[{row_number:0,model_identifier:'M',unique_identifier:'B',validation_errors:['bad']}]
  }),false);
});
