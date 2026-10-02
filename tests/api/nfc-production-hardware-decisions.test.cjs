'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

function read(path){return fs.readFileSync(path,'utf8');}

test('NTAG215 invalid app signature remains inconclusive and production-ineligible',()=>{
  const d=JSON.parse(read('data/dpp-ntag215-originality-investigation.json'));
  assert.equal(d.observed_signature_result,'Invalid');
  assert.equal(d.classification,'INCONCLUSIVE_REJECT');
  assert.equal(d.production_eligible,false);
  assert.equal(d.qualifies_for_cr13,false);
  assert.equal(d.qualifies_for_cr24,false);
  assert.ok(d.allowed_hypotheses.includes('counterfeit_or_clone'));
  assert.ok(d.allowed_hypotheses.includes('verifier_implementation_or_public_key_mismatch'));
});

test('CR02 pins exact HVQFN production candidate and keeps eval requirement',()=>{
  const body=read('docs/DPP_CRYPTO_CR02_PRODUCTION_SKU_DECISION.md');
  assert.match(body,/NT4PLDJHN2\/2003LXJ/);
  assert.match(body,/NTAG-X-DNA-EVAL/);
  assert.match(body,/NT4PMDJU32/);
  assert.match(body,/no longer manufactured/i);
  assert.match(body,/CR02 remains \*\*YELLOW\*\*/);
});

test('CR13 hardware plan requires vendor wire format and real replay failure',()=>{
  const body=read('docs/DPP_CRYPTO_CR13_REAL_HARDWARE_TEST_PLAN.md');
  assert.match(body,/0xF0F0/);
  assert.match(body,/RndB/);
  assert.match(body,/RndA/);
  assert.match(body,/64-byte ECDSA signature/);
  assert.match(body,/replay/i);
  assert.match(body,/static DPP URL/i);
  assert.match(body,/Software-generated keypair tests remain unit evidence only/);
});

test('SoulFlame integration contract forbids UID authenticity and shared FK without decision',()=>{
  const body=read('docs/DPP_CRYPTO_SOULFLAME_PROVISIONING_INTEGRATION.md');
  assert.match(body,/raw NFC UID is metadata, never authenticity/);
  assert.match(body,/dpp_physical_carriers/);
  assert.match(body,/Do not add one until SoulFlame confirms/i);
  assert.match(body,/shared-contract decision/i);
});
