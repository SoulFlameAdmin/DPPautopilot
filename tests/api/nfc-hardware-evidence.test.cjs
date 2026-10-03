'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {validateEvidence}=require('../../scripts/validate-dpp-crypto-hardware-evidence.cjs');

function template(){return JSON.parse(fs.readFileSync('data/dpp-crypto-hardware-evidence-template.json','utf8'));}

test('pending template is structurally valid but not falsely complete',()=>{
  const d=template();assert.equal(validateEvidence(d).ok,true);assert.equal(d.result,'PENDING');
});

test('PASS test requires evidence reference',()=>{
  const d=template();d.tests[0].status='PASS';d.tests[0].evidence=[];
  assert.equal(validateEvidence(d).ok,false);
  assert.ok(validateEvidence(d).errors.includes('HW01:pass_without_evidence'));
});

test('NOT_APPLICABLE requires reason',()=>{
  const d=template();d.tests[15].status='NOT_APPLICABLE';
  assert.equal(validateEvidence(d).ok,false);
});

test('overall PASS impossible while any test is pending or failed',()=>{
  const d=template();d.result='PASS';d.commit_sha='abc';d.captured_at='2026-10-02T00:00:00Z';d.hardware.exact_sku='SKU';
  assert.equal(validateEvidence(d).ok,false);
  assert.ok(validateEvidence(d).errors.includes('result_pass_with_unfinished_tests'));
});

test('fully evidenced matrix can pass',()=>{
  const d=template();d.commit_sha='abc';d.captured_at='2026-10-02T00:00:00Z';d.hardware.exact_sku='SKU';
  for(const t of d.tests){t.status='PASS';t.evidence=[`evidence/${t.id}.txt`];}
  d.result='PASS';
  assert.equal(validateEvidence(d).ok,true);
});
