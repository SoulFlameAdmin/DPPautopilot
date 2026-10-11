'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {validateNormalizedRows}=require('../../api/_import_normalized_row_validation.js');

function lmtRow(identifier='urn:dpp:batch:1',capacity=20){
  return {
    normalized_model:{
      model_identifier:'LMT-SKU-1',manufacturer_name:'Maker',category:'light_means_of_transport',
      canonical_data:{
        identification:{manufacturer:{name:'Maker'},model_id:'LMT-SKU-1',category:'light_means_of_transport'},
        rated_capacity_ah:capacity,
        voltage:{minimum_v:39,nominal_v:48,maximum_v:54.6}
      }
    },
    normalized_item:{
      unique_identifier:identifier,lifecycle_status:'original',
      canonical_data:{unique_identifier:identifier,usage:{cycles:10},performance:{capacity_fade_pct:3}}
    },
    validation_errors:[]
  };
}
function rowCodes(result,rowNumber){
  return result.find(x=>x.row===rowNumber)?.errors.map(x=>x.code)||[];
}

test('same battery identifier cannot appear twice in one staged batch',()=>{
  const result=validateNormalizedRows([lmtRow('urn:dpp:same'),lmtRow('urn:dpp:same')]);
  assert.ok(rowCodes(result,1).includes('DUPLICATE_IDENTIFIER_IN_BATCH'));
  assert.ok(rowCodes(result,2).includes('DUPLICATE_IDENTIFIER_IN_BATCH'));
});

test('same model id with different model canonical data fails instead of last-row-wins upsert',()=>{
  const first=lmtRow('urn:dpp:one',20);
  const second=lmtRow('urn:dpp:two',21);
  const result=validateNormalizedRows([first,second]);
  assert.ok(rowCodes(result,1).includes('MODEL_CONFLICT_IN_BATCH'));
  assert.ok(rowCodes(result,2).includes('MODEL_CONFLICT_IN_BATCH'));
});

test('same model id with identical model data is allowed for different battery items',()=>{
  const result=validateNormalizedRows([lmtRow('urn:dpp:one'),lmtRow('urn:dpp:two')]);
  assert.equal(result.some(x=>x.errors.some(e=>e.code==='MODEL_CONFLICT_IN_BATCH')),false);
  assert.equal(result.some(x=>x.errors.some(e=>e.code==='DUPLICATE_IDENTIFIER_IN_BATCH')),false);
});
