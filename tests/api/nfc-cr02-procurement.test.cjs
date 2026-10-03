'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const path='data/dpp-crypto-cr02-procurement-evidence.json';
function evidence(){return JSON.parse(fs.readFileSync(path,'utf8'));}

test('CR02 procurement snapshot pins the exact lab and production parts',()=>{
  const d=evidence();
  assert.equal(d.schema,'dpp.crypto.cr02.procurement.v1');
  assert.equal(d.lab_target.part_number,'NTAG-X-DNA-EVAL');
  assert.equal(d.lab_target.kit_contents,'3 evaluation boards');
  assert.equal(d.production_candidate.part_number,'NT4PLDJHN2/2003LXJ');
  assert.match(d.production_candidate.package,/HVQFN/);
});

test('CR02 uses manufacturer/authorized-distributor evidence and keeps gray market out',()=>{
  const d=evidence();
  assert.match(d.sourcing_rule,/NXP-authorized distributor/i);
  assert.match(d.sourcing_rule,/gray-market/i);
  assert.ok(d.lab_target.manufacturer_listing.stock>0);
  assert.ok(d.lab_target.authorized_distributor_snapshots.some(x=>x.stock>0));
  assert.ok(d.production_candidate.authorized_distributor_snapshots.some(x=>x.stock>0));
});

test('orderability alone cannot promote CR02 GREEN',()=>{
  const d=evidence();
  assert.equal(d.status,'ORDERABLE_NOT_RECEIVED');
  assert.equal(d.qualifies_cr02_green_now,false);
  assert.equal(d.green_gate.order_or_possession_evidence_required,true);
  assert.equal(d.green_gate.exact_received_part_required,true);
  assert.equal(d.green_gate.target_phone_test_required,true);
  assert.equal(d.green_gate.provisioning_evidence_required,true);
  assert.equal(d.green_gate.configuration_lock_evidence_required,true);
});
