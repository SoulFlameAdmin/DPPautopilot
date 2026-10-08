'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../../api/manufacturer-onboarding.js');
const api=handler._test;

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value},
    end(value){this.body=value||''}
  };
}
function makeReq(method,body,auth='Bearer test-token'){
  return {method,body,query:{},headers:auth?{authorization:auth}:{}};
}

const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('manufacturer onboarding requires bearer authentication',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('should not call')};
  try{
    const res=makeRes();
    await handler(makeReq('GET',null,null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  }finally{global.fetch=original}
});

test('answer validation accepts only the eight stable onboarding keys',()=>{
  assert.equal(api.validateAnswerBody({action:'answer',question_key:'onboardingQ1',raw_answer:'SoulFlame Batteries',structured_value:{company_name:'SoulFlame'}}),null);
  assert.equal(api.validateAnswerBody({action:'answer',question_key:'onboardingQ9',raw_answer:'x',structured_value:{}}),'question_key');
  assert.equal(api.validateAnswerBody({action:'answer',question_key:'onboardingQ2',raw_answer:'   ',structured_value:{}}),'raw_answer');
  assert.equal(api.validateAnswerBody({action:'answer',question_key:'onboardingQ2',raw_answer:'portable',structured_value:[]}),'structured_value');
});

test('answer response contract carries tenant and user ownership',()=>{
  assert.equal(api.validAnswer({
    organization_id:ORG,
    question_key:'onboardingQ4',
    user_id:USER,
    raw_answer:'serials and batches',
    structured_value:{tracking:'both'},
    updated_at:'2026-10-07T03:00:00.000Z'
  }),true);
});

test('state contract requires bounded completion state',()=>{
  assert.equal(api.validState({
    organization_id:ORG,
    user_id:USER,
    answered_count:1,
    complete:false,
    answers:[{
      question_key:'onboardingQ1',raw_answer:'Maker',structured_value:{company_name:'Maker'},
      user_id:USER,updated_at:'2026-10-07T03:00:00.000Z'
    }],
    configuration:null
  }),true);
  assert.equal(api.validState({organization_id:ORG,user_id:USER,answered_count:9,complete:true,answers:[],configuration:null}),false);
});

test('8/8 onboarding cannot fabricate manufactured Product, Batch, DPP or QR',()=>{
  const keys=['company','workflow','product','batch','dpp','qr','ready'];
  const steps=keys.map((key,index)=>({key,status:index===0?'done':'pending'}));
  const state={organization_id:ORG,status:'configured',revision:1,
    configured_at:'2026-10-07T03:00:00.000Z',steps};
  assert.equal(api.validConfigure(state),true);
  // All-done is the historical misleading response. Reject, do not misreport 100%.
  assert.equal(api.validConfigure({...state,steps:keys.map(key=>({key,status:'done'}))}),false);
  for(const key of ['workflow','product','batch','dpp','qr','ready']){
    const incorrect=steps.map(step=>step.key===key?{key,status:'done'}:step);
    assert.equal(api.validConfigure({...state,steps:incorrect}),false,key);
  }
  assert.equal(api.validConfigure({...state,steps:[...steps.slice(0,6),{key:'ready',status:'loading'}]}),false);
});

test('configure RPC rejects legacy database response declaring fake production-ready',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',DPP_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_key'};
  const steps=['company','workflow','product','batch','dpp','qr','ready'].map(key=>({key,status:'done'}));
  await assert.rejects(
    ()=>api.rpc('dpp_api_manufacturer_onboarding_configure',{},'Bearer real-user',env,
      async()=>({ok:true,json:async()=>({
        organization_id:ORG,status:'configured',revision:2,
        configured_at:'2026-10-07T03:00:00.000Z',steps
      })})),
    e=>e.status===502&&e.publicCode==='UPSTREAM_ERROR'
  );
});

test('configure RPC accepts truthfully pending manufacturing after 8/8',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',DPP_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_key'};
  const keys=['company','workflow','product','batch','dpp','qr','ready'];
  const steps=keys.map((key,index)=>({key,status:index===0?'done':'pending'}));
  const data=await api.rpc('dpp_api_manufacturer_onboarding_configure',{},'Bearer real-user',env,
    async()=>({ok:true,json:async()=>({
      organization_id:ORG,status:'configured',revision:2,
      configured_at:'2026-10-07T03:00:00.000Z',steps
    })}));
  assert.equal(data.steps.find(step=>step.key==='ready').status,'pending');
});

test('RPC forwards bearer token and exact answer payload',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',DPP_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_key'};
  let seen;
  const fetchImpl=async(url,options)=>{
    seen={url,options};
    return {
      ok:true,
      async json(){return {
        organization_id:ORG,question_key:'onboardingQ7',user_id:USER,
        raw_answer:'CSV and ERP',structured_value:{import_method:['csv','erp']},
        updated_at:'2026-10-07T03:00:00.000Z'
      }}
    };
  };
  const result=await api.rpc('dpp_api_manufacturer_onboarding_answer_upsert',{
    p_question_key:'onboardingQ7',p_raw_answer:'CSV and ERP',p_structured_value:{import_method:['csv','erp']}
  },'Bearer real-user',env,fetchImpl);
  assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_manufacturer_onboarding_answer_upsert');
  assert.equal(seen.options.headers.Authorization,'Bearer real-user');
  assert.deepEqual(JSON.parse(seen.options.body),{
    p_question_key:'onboardingQ7',p_raw_answer:'CSV and ERP',p_structured_value:{import_method:['csv','erp']}
  });
  assert.equal(result.question_key,'onboardingQ7');
});

test('incomplete configure maps DP501 to stable validation error',async()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',DPP_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_key'};
  const fetchImpl=async()=>({
    ok:false,
    async json(){return {code:'DP501',message:'all eight onboarding answers are required'}}
  });
  await assert.rejects(
    ()=>api.rpc('dpp_api_manufacturer_onboarding_configure',{},'Bearer real-user',env,fetchImpl),
    error=>error.status===422&&error.publicCode==='VALIDATION_ERROR'
  );
});
