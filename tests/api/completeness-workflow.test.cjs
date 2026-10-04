'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/passport.js');

function makeRes(){
  return {statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
function req(method='GET',body={},query={},auth='Bearer step19-token'){
  return {method,body,query,headers:{...(auth?{authorization:auth}:{}),'x-forwarded-for':'203.0.113.119'}};
}
function withEnv(){
  const old={url:process.env.DPP_SUPABASE_URL,key:process.env.DPP_SUPABASE_PUBLISHABLE_KEY,shared:process.env.DPP_SHARED_RATE_LIMIT_ENABLED};
  process.env.DPP_SUPABASE_URL='https://example.supabase.co';
  process.env.DPP_SUPABASE_PUBLISHABLE_KEY='publishable-key';
  process.env.DPP_SHARED_RATE_LIMIT_ENABLED='false';
  return ()=>{for(const [k,v] of Object.entries({DPP_SUPABASE_URL:old.url,DPP_SUPABASE_PUBLISHABLE_KEY:old.key,DPP_SHARED_RATE_LIMIT_ENABLED:old.shared})){if(v===undefined)delete process.env[k];else process.env[k]=v;}};
}
const passportId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const itemId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const modelId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function report(overrides={}){
  return {
    passport_id:passportId,battery_item_id:itemId,model_id:modelId,
    unique_identifier:'BAT-S19-001',status:'draft',schema_version:'2.0.0-lmt-2026-10-04',
    missing_points:[27,50],undecided_conditional_points:[35],missing_count:2,undecided_count:1,ready:false,
    passport_updated_at:'2026-10-05T00:10:00.000Z',
    required_point_count:50,complete_point_count:48,blocking_count:3,workflow_score_percent:94.1,
    ...overrides
  };
}

test('authenticated readiness by identifier uses production completeness RPC',async()=>{
  const restore=withEnv(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{seen={url,options};return {ok:true,async json(){return report();}};};
  try{
    const res=makeRes();
    await handler(req('GET',null,{identifier:'BAT-S19-001',readiness:'1'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_scooter_completeness_by_identifier');
    assert.deepEqual(JSON.parse(seen.options.body),{p_unique_identifier:'BAT-S19-001'});
    const data=JSON.parse(res.body).data;
    assert.equal(data.workflow_score_percent,94.1);
    assert.equal(data.blocking_count,3);
    assert.equal(data.passport_updated_at,'2026-10-05T00:10:00.000Z');
  }finally{global.fetch=original;restore();}
});

test('readiness by identifier requires bearer and never falls through to public draft lookup',async()=>{
  const original=global.fetch;let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(req('GET',null,{identifier:'BAT-S19-001',readiness:'1'},null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('field-50 evidence submission is write-only and returns receipt metadata only',async()=>{
  const restore=withEnv(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      passport_id:passportId,model_id:modelId,field_number:50,accepted:true,updated_at:'2026-10-05T00:12:00.000Z'
    };}};
  };
  try{
    const res=makeRes();
    await handler(req('PATCH',{
      id:passportId,action:'submit_authority_evidence',field_number:50,
      evidence:{document_ref:'LAB-REPORT-001'},expected_updated_at:'2026-10-05T00:10:00.000Z'
    }),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_scooter_authority_evidence_submit');
    const sent=JSON.parse(seen.options.body);
    assert.deepEqual(sent,{p_passport_id:passportId,p_field_number:50,p_evidence:{document_ref:'LAB-REPORT-001'}});
    const data=JSON.parse(res.body).data;
    assert.equal(data.accepted,true);
    assert.equal(Object.prototype.hasOwnProperty.call(data,'evidence'),false);
  }finally{global.fetch=original;restore();}
});

test('invalid evidence action is rejected before upstream',async()=>{
  const original=global.fetch;let called=false;global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    for(const body of [
      {id:passportId,action:'submit_authority_evidence',field_number:49,evidence:{document_ref:'X'},expected_updated_at:'2026-10-05T00:10:00Z'},
      {id:passportId,action:'submit_authority_evidence',field_number:50,evidence:{},expected_updated_at:'2026-10-05T00:10:00Z'}
    ]){
      const res=makeRes();await handler(req('PATCH',body),res);
      assert.equal(res.statusCode,422);assert.equal(JSON.parse(res.body).error.code,'VALIDATION_ERROR');
    }
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('malformed completeness response fails closed',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:true,async json(){return report({workflow_score_percent:101});}});
  try{
    const res=makeRes();await handler(req('GET',null,{identifier:'BAT-S19-001',readiness:'1'}),res);
    assert.equal(res.statusCode,502);assert.equal(JSON.parse(res.body).error.code,'UPSTREAM_ERROR');
  }finally{global.fetch=original;restore();}
});
