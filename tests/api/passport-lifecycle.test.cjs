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
function req(method='GET',body={},query={},auth='Bearer step21-token'){
  return {method,body,query,headers:{...(auth?{authorization:auth}:{}),'x-forwarded-for':'203.0.113.121'}};
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

test('public identifier GET resolves lifecycle tombstone without payload leakage',async()=>{
  const restore=withEnv(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      kind:'lifecycle',passport_id:passportId,unique_identifier:'BAT-S21-OLD',
      status:'replaced',reason_code:'product_replaced',
      replacement_identifier:'BAT-S21-NEW',
      updated_at:'2026-10-05T00:45:00.000Z',changed_at:'2026-10-05T00:45:00.000Z',
      public_payload:{secret:'MUST-NOT-LEAK'},reason_note:'internal note'
    };}};
  };
  try{
    const res=makeRes();
    await handler(req('GET',null,{identifier:'BAT-S21-OLD'},null),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_passport_public_resolve');
    const data=JSON.parse(res.body).data;
    assert.equal(data.kind,'lifecycle');
    assert.equal(data.status,'replaced');
    assert.equal(data.replacement_identifier,'BAT-S21-NEW');
    assert.equal(Object.prototype.hasOwnProperty.call(data,'public_payload'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(data,'reason_note'),false);
    assert.equal(res.body.includes('MUST-NOT-LEAK'),false);
    assert.equal(res.body.includes('internal note'),false);
  }finally{global.fetch=original;restore();}
});

test('public identifier GET preserves sanitized active passport response',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:true,async json(){return {
    kind:'active',passport_id:passportId,battery_item_id:itemId,unique_identifier:'BAT-S21-ACTIVE',
    status:'active',public_payload:{
      model:{identification:{manufacturer:{name:'Safe Maker'}}},
      item:{unique_identifier:'BAT-S21-ACTIVE',state_of_health:{percent:99}}
    },
    updated_at:'2026-10-05T00:45:00.000Z'
  };}});
  try{
    const res=makeRes();await handler(req('GET',null,{identifier:'BAT-S21-ACTIVE'},null),res);
    assert.equal(res.statusCode,200);
    const data=JSON.parse(res.body).data;
    assert.equal(data.kind,'active');
    assert.equal(data.public_payload.model.identification.manufacturer.name,'Safe Maker');
    assert.equal(data.public_payload.item.state_of_health,undefined);
  }finally{global.fetch=original;restore();}
});

test('replace action calls lifecycle transition RPC with optimistic timestamp',async()=>{
  const restore=withEnv(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {
      passport_id:passportId,battery_item_id:itemId,status:'replaced',
      public_payload:{},private_payload:{},
      created_at:'2026-10-05T00:40:00.000Z',updated_at:'2026-10-05T00:46:00.000Z'
    };}};
  };
  try{
    const res=makeRes();
    await handler(req('PATCH',{
      id:passportId,action:'replace',reason_code:'product_replaced',
      reason_note:'old pack replaced',replacement_identifier:'BAT-S21-NEW',
      expected_updated_at:'2026-10-05T00:45:00.000Z'
    }),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_scooter_passport_transition');
    assert.deepEqual(JSON.parse(seen.options.body),{
      p_passport_id:passportId,p_transition:'replaced',p_reason_code:'product_replaced',
      p_reason_note:'old pack replaced',p_replacement_identifier:'BAT-S21-NEW',
      p_expected_updated_at:'2026-10-05T00:45:00.000Z'
    });
  }finally{global.fetch=original;restore();}
});

test('retire and revoke actions are accepted but replacement fields are rejected',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async(_url,options)=>({ok:true,async json(){return {
    passport_id:passportId,battery_item_id:itemId,
    status:JSON.parse(options.body).p_transition,
    public_payload:{},private_payload:{},
    created_at:'2026-10-05T00:40:00.000Z',updated_at:'2026-10-05T00:46:00.000Z'
  };}});
  try{
    for(const [action,reason] of [['retire','end_of_life'],['revoke','operator_revoked']]){
      const res=makeRes();
      await handler(req('PATCH',{id:passportId,action,reason_code:reason,expected_updated_at:'2026-10-05T00:45:00.000Z'}),res);
      assert.equal(res.statusCode,200);
      assert.equal(JSON.parse(res.body).data.status,action==='retire'?'retired':'revoked');
    }
    const bad=makeRes();
    await handler(req('PATCH',{
      id:passportId,action:'retire',reason_code:'end_of_life',
      replacement_identifier:'NOT-ALLOWED',expected_updated_at:'2026-10-05T00:45:00.000Z'
    }),bad);
    assert.equal(bad.statusCode,422);
  }finally{global.fetch=original;restore();}
});

test('generic terminal status PATCH is blocked before upstream',async()=>{
  const original=global.fetch;let called=false;global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    for(const status of ['retired','revoked','replaced']){
      const res=makeRes();
      await handler(req('PATCH',{id:passportId,status,expected_updated_at:'2026-10-05T00:45:00.000Z'}),res);
      assert.equal(res.statusCode,409);
      assert.equal(JSON.parse(res.body).error.code,'LIFECYCLE_ROUTE_REQUIRED');
    }
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('malformed lifecycle upstream response fails closed',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:true,async json(){return {
    kind:'lifecycle',passport_id:passportId,unique_identifier:'BAT-S21-OLD',
    status:'replaced',reason_code:'product_replaced',replacement_identifier:null,
    updated_at:'2026-10-05T00:45:00.000Z',changed_at:'2026-10-05T00:45:00.000Z'
  };}});
  try{
    const res=makeRes();await handler(req('GET',null,{identifier:'BAT-S21-OLD'},null),res);
    assert.equal(res.statusCode,502);
    assert.equal(JSON.parse(res.body).error.code,'UPSTREAM_ERROR');
  }finally{global.fetch=original;restore();}
});
