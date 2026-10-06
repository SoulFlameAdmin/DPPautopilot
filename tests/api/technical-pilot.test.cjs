'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const pilot=require('../../api/technical-pilot.js');

const ITEM='11111111-1111-4111-8111-111111111111';
const PASSPORT='22222222-2222-4222-8222-222222222222';
const MODEL='33333333-3333-4333-8333-333333333333';

function result(overrides={}){
  return {
    passport_id:PASSPORT,
    battery_item_id:ITEM,
    model_id:MODEL,
    unique_identifier:'BV-PILOT-000001',
    status:'active',
    public_payload:{
      model:{identification:{category:'industrial',model_id:'BV-DEMO-1',manufacturer:{name:'Pilot Manufacturer'}}},
      item:{unique_identifier:'BV-PILOT-000001'},
      pilot:{mode:'technical_pilot',regulatory_compliance:false,scope:'customer_data_validation',published_at:'2026-10-06T15:30:00Z'}
    },
    private_payload:{},
    technical_pilot:true,
    regulatory_compliance:false,
    created:true,
    idempotent_replay:false,
    created_at:'2026-10-06T15:30:00Z',
    updated_at:'2026-10-06T15:30:00Z',
    ...overrides
  };
}

test('technical pilot validates bounded public payload',()=>{
  const ok=pilot._test.validateBody({
    battery_item_id:ITEM,
    public_payload:{item:{unique_identifier:'BV-PILOT-000001'}},
    private_payload:{}
  });
  assert.equal(ok.status,undefined);

  const missing=pilot._test.validateBody({battery_item_id:ITEM,public_payload:{},private_payload:{}});
  assert.equal(missing.status,422);

  const restricted=pilot._test.validateBody({
    battery_item_id:ITEM,
    public_payload:{
      item:{unique_identifier:'BV-PILOT-000001'},
      model:{restricted_composition:{cathode:'secret'}}
    },
    private_payload:{}
  });
  assert.equal(restricted.status,422);
});

test('technical pilot result contract requires explicit no-compliance marker',()=>{
  assert.equal(pilot._test.validPilotResult(result()),true);
  assert.equal(pilot._test.validPilotResult(result({regulatory_compliance:true})),false);
  assert.equal(pilot._test.validPilotResult(result({technical_pilot:false})),false);
  assert.equal(pilot._test.validPilotResult(result({status:'draft'})),false);
});

test('technical pilot RPC targets dedicated publish function and validates response',async()=>{
  let seen=null;
  const fetchImpl=async(url,options)=>{
    seen={url,options};
    return {ok:true,status:200,async json(){return result();}};
  };
  const out=await pilot._test.rpc(
    {p_battery_item_id:ITEM,p_public_payload:{item:{unique_identifier:'BV-PILOT-000001'}},p_private_payload:{}},
    'Bearer test-token',
    {DPP_SUPABASE_URL:'https://example.supabase.co',DPP_SUPABASE_PUBLISHABLE_KEY:'pk-test'},
    fetchImpl,
    1000
  );
  assert.equal(out.technical_pilot,true);
  assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_technical_pilot_publish');
  assert.equal(seen.options.method,'POST');
  assert.equal(seen.options.headers.Authorization,'Bearer test-token');
});

test('technical pilot RPC fails closed on shape drift',async()=>{
  const fetchImpl=async()=>({ok:true,status:200,async json(){return {status:'active'};}});
  await assert.rejects(
    ()=>pilot._test.rpc(
      {p_battery_item_id:ITEM,p_public_payload:{item:{unique_identifier:'BV-PILOT-000001'}},p_private_payload:{}},
      'Bearer test-token',
      {DPP_SUPABASE_URL:'https://example.supabase.co',DPP_SUPABASE_PUBLISHABLE_KEY:'pk-test'},
      fetchImpl,
      1000
    ),
    /UPSTREAM_ERROR/
  );
});
