'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const exp=require('../../api/export.js')._test;

const bundle={
  organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  generated_at:'2026-10-04T19:00:00Z',
  records:{
    battery_models:[{
      id:'11111111-1111-4111-8111-111111111111',
      model_identifier:'LMT-48V-20AH',
      manufacturer_name:'Maker, Ltd.',
      category:'light_means_of_transport',
      created_at:'2026-10-01T00:00:00Z',
      updated_at:'2026-10-01T00:00:00Z'
    }],
    battery_items:[{
      id:'22222222-2222-4222-8222-222222222222',
      model_id:'11111111-1111-4111-8111-111111111111',
      unique_identifier:'BAT-0001',
      lifecycle_status:'original',
      canonical_data:{state_of_health:{percent:98},telemetry:{state_of_charge:[{percent:50}]}},
      created_at:'2026-10-02T00:00:00Z',
      updated_at:'2026-10-03T00:00:00Z'
    }],
    passports:[{
      id:'33333333-3333-4333-8333-333333333333',
      battery_item_id:'22222222-2222-4222-8222-222222222222',
      status:'active'
    }]
  }
};

test('Stage 11 MES CSV joins model item and passport identity safely',()=>{
  const csv=exp.integrationProjection(bundle,'mes_csv');
  assert.match(csv,/unique_identifier,model_identifier/);
  assert.match(csv,/BAT-0001,LMT-48V-20AH,"Maker, Ltd\."/);
  assert.match(csv,/original,active/);
});

test('Stage 11 ERP JSON exposes stable model and battery identifiers',()=>{
  const data=exp.integrationProjection(bundle,'erp_json');
  assert.equal(data.schema_version,'erp-v1');
  assert.equal(data.models[0].model_identifier,'LMT-48V-20AH');
  assert.equal(data.batteries[0].unique_identifier,'BAT-0001');
});

test('Stage 11 BMS JSON exposes battery telemetry projection',()=>{
  const data=exp.integrationProjection(bundle,'bms_json');
  assert.equal(data.schema_version,'bms-v1');
  assert.equal(data.batteries[0].state_of_health.percent,98);
  assert.equal(data.batteries[0].telemetry.state_of_charge[0].percent,50);
  assert.equal(data.batteries[0].passport_status,'active');
});

test('Stage 11 export format selector is fail-closed',()=>{
  assert.equal(exp.integrationFormat({query:{format:'mes_csv'}}),'mes_csv');
  assert.equal(exp.integrationFormat({query:{format:'ERP_JSON'}}),'erp_json');
  assert.equal(exp.integrationFormat({query:{format:'unknown'}}),null);
});
