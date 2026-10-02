'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

function evidence(){
  return JSON.parse(fs.readFileSync('data/dpp-qr-nfc-e2e-evidence.json','utf8'));
}

test('NTAG215 convenience E2E records the exact canonical public DPP URL',()=>{
  const d=evidence();
  assert.equal(d.schema,'dpp.qr-nfc.e2e.v1');
  assert.equal(d.battery.public_identifier,'BAT-SF-NFC-0001');
  assert.equal(d.battery.carrier,'NTAG215');
  assert.equal(
    d.canonical_url,
    'https://frhletkiuupgksmgxoxc.supabase.co/functions/v1/sf-dpp-passport?identifier=BAT-SF-NFC-0001'
  );
  assert.equal(d.renderer.canonical_url_changed,false);
});

test('physical QR/NDEF flow is fully PASS',()=>{
  const d=evidence();
  for(const [name,status] of Object.entries(d.results)){
    assert.equal(status,'PASS',`${name} must be PASS`);
  }
  assert.equal(d.overall_result,'PASS');
});

test('NTAG215 E2E cannot be mis-scored as Secure NFC cryptographic evidence',()=>{
  const d=evidence();
  assert.equal(d.security_boundary.classification,'NDEF_URL_CARRIER_E2E_ONLY');
  assert.deepEqual(d.security_boundary.eligible_secure_nfc_cr_gates,[]);
  assert.deepEqual(d.security_boundary.not_evidence_for,['CR02','CR13','CR24']);
  assert.ok(d.security_boundary.does_not_prove.includes('cryptographic tag authenticity'));
  assert.ok(d.security_boundary.does_not_prove.includes('challenge-response proof'));
});

test('tag remains writable and signature warning is preserved as evidence',()=>{
  const d=evidence();
  assert.equal(d.tag_observations.writable,true);
  assert.equal(d.tag_observations.locked_read_only,false);
  assert.equal(d.tag_observations.nfc_tools_signature,'Invalid');
});
