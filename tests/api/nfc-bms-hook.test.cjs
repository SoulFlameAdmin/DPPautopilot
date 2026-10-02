'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

function combine({nfc,bms}){
  if(nfc==='backend_error') return 'backend_error';
  if(nfc==='tampered') return 'nfc_tampered';
  if(nfc!=='authentic') return 'nfc_invalid';
  if(bms==null) return 'nfc_authentic_bms_not_present';
  if(bms==='authentic') return 'nfc_authentic_bms_authentic';
  if(bms==='backend_error') return 'backend_error';
  return 'nfc_authentic_bms_invalid';
}

test('BMS can never rescue invalid NFC',()=>{
  assert.equal(combine({nfc:'invalid',bms:'authentic'}),'nfc_invalid');
  assert.equal(combine({nfc:'revoked',bms:'authentic'}),'nfc_invalid');
});
test('tamper dominates BMS success',()=>{
  assert.equal(combine({nfc:'tampered',bms:'authentic'}),'nfc_tampered');
});
test('missing BMS is explicit',()=>{
  assert.equal(combine({nfc:'authentic',bms:null}),'nfc_authentic_bms_not_present');
});
test('both authentic is distinct',()=>{
  assert.equal(combine({nfc:'authentic',bms:'authentic'}),'nfc_authentic_bms_authentic');
});
