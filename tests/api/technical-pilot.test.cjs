'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const passport=require('../../api/passport.js');

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

test('technical pilot response contract requires explicit non-compliance marker',()=>{
  assert.equal(passport._test.validTechnicalPilotPassport(result()),true);
  assert.equal(passport._test.validTechnicalPilotPassport(result({regulatory_compliance:true})),false);
  assert.equal(passport._test.validTechnicalPilotPassport(result({technical_pilot:false})),false);
  assert.equal(passport._test.validTechnicalPilotPassport(result({status:'draft'})),false);
  assert.equal(
    passport._test.validTechnicalPilotPassport(result({public_payload:{item:{unique_identifier:'BV-PILOT-000001'}}})),
    false
  );
});

test('passport RPC shape validator fail-closes technical pilot drift',()=>{
  assert.equal(passport._test.validateRpcShape('dpp_api_technical_pilot_publish',result()),true);
  assert.equal(passport._test.validateRpcShape('dpp_api_technical_pilot_publish',{status:'active'}),false);
});

test('public/private policy validation remains fail-closed for technical pilot payloads',()=>{
  assert.equal(
    passport._test.validatePublicPayloadAccess({
      model:{restricted_composition:{cathode:'secret'}}
    })!=null,
    true
  );
  assert.equal(
    passport._test.validateOrganizationPrivatePayloadAccess({
      model:{compliance_test_reports:[{document_ref:'authority-only'}]}
    })!=null,
    true
  );
});
