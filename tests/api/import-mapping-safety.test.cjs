'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const imports=require('../../api/imports.js');

function profile(fieldMapping){
  return {
    id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name:'mapping',source_format:'csv',source_headers:['source'],field_mapping:fieldMapping,
    revision:1,created_at:'2026-09-19T00:00:00.000Z',updated_at:'2026-09-19T00:00:00.000Z'
  };
}

test('harmless retired legacy mapping stays readable for migration/review',()=>{
  assert.equal(imports._test.safeStoredMappingTarget('item.state_of_health.percent'),true);
  assert.equal(imports._test.validMappingProfile(profile({source:'item.state_of_health.percent'})),true);
});

test('stored mapping cannot carry prototype-chain path into browser mapping helpers',()=>{
  for(const target of [
    'model.__proto__.polluted',
    'model.constructor.prototype.polluted',
    'item.prototype.value'
  ]){
    assert.equal(imports._test.safeStoredMappingTarget(target),false,target);
    assert.equal(imports._test.validMappingProfile(profile({source:target})),false,target);
  }
});

test('new mapping save remains stricter than legacy read compatibility',()=>{
  assert.equal(imports._test.validFieldMapping({source:'item.state_of_health.percent'}),false);
  assert.equal(imports._test.validFieldMapping({source:'model.rated_capacity_ah'}),true);
});
