'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const validator=require('../../api/_import_normalized_row_validation.js');
const imports=require('../../api/imports.js');

function portableRow(overrides={}){
  return {
    normalized_model:{
      model_identifier:'M1',manufacturer_name:'Maker',category:'portable',
      canonical_data:{identification:{manufacturer:{name:'Maker'},model_id:'M1',category:'portable'}}
    },
    normalized_item:{
      unique_identifier:'urn:dpp:import:1',lifecycle_status:'original',
      canonical_data:{unique_identifier:'urn:dpp:import:1'}
    },
    validation_errors:[],
    ...overrides
  };
}
function lmtRow(){
  const row=portableRow();
  row.normalized_model.category='light_means_of_transport';
  row.normalized_model.canonical_data.identification.category='light_means_of_transport';
  row.normalized_model.canonical_data.rated_capacity_ah=20;
  row.normalized_model.canonical_data.voltage={minimum_v:39,nominal_v:48,maximum_v:54.6};
  row.normalized_item.canonical_data.usage={cycles:10};
  row.normalized_item.canonical_data.performance={capacity_fade_pct:3};
  return row;
}
function codes(row){return validator.validateNormalizedRow(row).map(x=>x.code);}


test('portable import keeps existing partial-import behavior but validates commit identities',()=>{
  assert.deepEqual(validator.validateNormalizedRow(portableRow()),[]);
});

test('LMT wrong scalar type cannot hide behind caller validation_errors=[]',()=>{
  const row=lmtRow();
  row.normalized_model.canonical_data.rated_capacity_ah='20000';
  row.validation_errors=[];
  assert.ok(codes(row).includes('VALUE_TYPE_INVALID'));
});

test('LMT percent and cycles enforce matrix domains',()=>{
  const row=lmtRow();
  row.normalized_item.canonical_data.performance.capacity_fade_pct=120;
  row.normalized_item.canonical_data.usage.cycles=-1;
  const found=codes(row);
  assert.ok(found.includes('PERCENT_OUT_OF_RANGE'));
  assert.ok(found.includes('CYCLES_NEGATIVE'));
});

test('LMT voltage ordering fails closed when all ordered members are present',()=>{
  const row=lmtRow();
  row.normalized_model.canonical_data.voltage={minimum_v:55,nominal_v:48,maximum_v:54.6};
  assert.ok(codes(row).includes('ORDERED_GROUP_INVALID'));
});

test('top-level commit identity cannot disagree with canonical duplicate',()=>{
  const row=lmtRow();
  row.normalized_model.canonical_data.identification.model_id='OTHER';
  assert.ok(codes(row).includes('MODEL_IDENTITY_MISMATCH'));
});

test('battery identifier rejects control characters and overlength values',()=>{
  let row=lmtRow();
  row.normalized_item.unique_identifier='urn:dpp:bad:\u0001';
  assert.ok(codes(row).includes('IDENTIFIER_INVALID'));
  row=lmtRow();
  row.normalized_item.unique_identifier='x'.repeat(301);
  assert.ok(codes(row).includes('IDENTIFIER_INVALID'));
});

test('saved mapping targets are restricted to known catalog or 71-point paths',()=>{
  assert.equal(validator.validMappingTarget('model.rated_capacity_ah'),true);
  assert.equal(validator.validMappingTarget('item.performance.capacity_fade_pct'),true);
  assert.equal(validator.validMappingTarget(''),true);
  assert.equal(validator.validMappingTarget('item.state_of_health.percent'),false);
  assert.equal(validator.validMappingTarget('model.__proto__.polluted'),false);
  assert.equal(imports._test.validFieldMapping({capacity:'model.rated_capacity_ah',unused:''}),true);
  assert.equal(imports._test.validFieldMapping({bad:'model.unknown_field'}),false);
});

test('row validator reports per-row failures without treating missing optional import data as completeness failure',()=>{
  const good=lmtRow(),bad=lmtRow();
  bad.normalized_model.canonical_data.rated_capacity_ah='20 Ah';
  const result=validator.validateNormalizedRows([good,bad]);
  assert.equal(result.length,1);
  assert.equal(result[0].row,2);
  assert.ok(result[0].errors.some(x=>x.code==='VALUE_TYPE_INVALID'));
});

test('document reference arrays must contain only non-empty references when supplied',()=>{
  const row=lmtRow();
  row.normalized_model.canonical_data.compliance_test_reports=['OK','   '];
  assert.ok(codes(row).includes('VALUE_TYPE_INVALID'));
});
