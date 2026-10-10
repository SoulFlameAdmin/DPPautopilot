'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planBatteryDraft, A5Error } = require('../../api/_ai_battery_draft_plan.js');

const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const context = {
  tenant_id: uuid(1), session_id: uuid(2), battery_item_id: uuid(3),
  revision: 7, category: 'light_means_of_transport',
  unique_identifier: 'urn:dpp:battery-100',
  model_identifier: 'EB-100', manufacturer_name: 'Example Battery Ltd'
};
const approval = { actor_id: uuid(4), event_id: uuid(5), revision: 7 };
const fact = (number, value, extra = {}) => ({
  number, value, source_type: 'user',
  source_ref: 'conversation:' + uuid(number + 100),
  reviewer_id: uuid(4), review_event_id: uuid(number + 200),
  verified: true, ...extra
});
const plan = (facts = [], options = {}) =>
  planBatteryDraft({context, facts, approval, ...options});

test('withhold arbitrary nested public object until schema review', () => {
  const p = plan([fact(30,{freeform_sensitive_info:{test_marker:'DO_NOT_EXPOSE'}})]);
  assert.ok(p.unmapped_complex_fields.includes(30));
  assert.equal(JSON.stringify(p.draft_body).includes('DO_NOT_EXPOSE'),false);
});
test('withhold nested private objects until a typed schema exists', () => {
  const p = plan([fact(45,{unreviewed_key:'DO_NOT_PERSIST'})]);
  assert.ok(p.unmapped_complex_fields.includes(45));
  assert.equal(JSON.stringify(p.draft_body).includes('DO_NOT_PERSIST'),false);
});
test('withhold arrays as well as objects', () => {
  const p = plan([fact(13,['freeform-value'])]);
  assert.ok(p.unmapped_complex_fields.includes(13));
  assert.equal(JSON.stringify(p.draft_body).includes('freeform-value'),false);
});
test('still maps a verified public scalar to the canonical field', () => {
  const p = plan([fact(11,12.5)]);
  assert.equal(p.draft_body.public_payload.model.rated_capacity_ah,12.5);
  assert.equal(p.mapped,1);
});
test('still maps a verified private scalar only to private payload', () => {
  const p = plan([fact(51,12.5)]);
  assert.equal(p.draft_body.private_payload.item.performance.rated_capacity_ah,12.5);
  assert.equal(p.draft_body.public_payload.item,undefined);
});
test('authority-only reports never enter organizational draft payload', () => {
  const p = plan([fact(50,['authority-report-ref'])]);
  assert.ok(p.authority_separate.includes(50));
  assert.equal(JSON.stringify(p.draft_body).includes('authority-report-ref'),false);
});
test('economic-operator identity remains held for policy review', () => {
  const p = plan([fact(2,{name:'Responsible Operator'})]);
  assert.ok(p.policy_review.includes(2));
  assert.equal(JSON.stringify(p.draft_body).includes('Responsible Operator'),false);
});
test('the helper never publishes or activates regardless of state', () => {
  const p = plan([fact(11,12.5)]);
  assert.equal(p.can_publish,false);
  assert.equal(p.can_activate,false);
  assert.equal(p.compliance_assessed,false);
});
test('without explicit approval no write proposal is returned', () => {
  const p = planBatteryDraft({context,facts:[fact(11,12.5)]});
  assert.equal(p.draft_body,null);
});
test('stale approval is rejected', () => {
  assert.throws(() => plan([fact(11,12.5)],{approval:{...approval,revision:6}}),
    e => e instanceof A5Error && e.code === 'STALE_APPROVAL');
});
test('manufacturer identity drift is rejected', () => {
  assert.throws(() => plan([fact(3,'Other Company')]),
    e => e instanceof A5Error && e.code === 'IDENTITY_MISMATCH');
});
test('conditional fields need explicit applicability review', () => {
  const p = plan([fact(68,100)]);
  assert.ok(p.pending_conditional.includes(68));
  assert.equal(p.mapped,0);
});
test('approved incomplete values are still just an incomplete draft', () => {
  const p = plan();
  assert.equal(p.missing.length,50);
  assert.equal(p.can_publish,false);
  assert.equal(p.compliance_assessed,false);
});
test('AI-authored factual provenance is rejected', () => {
  assert.throws(() => plan([fact(11,12.5,{source_type:'ai'})]),
    e => e instanceof A5Error && e.code === 'INVALID_FACT');
});
test('invalid LMT point is rejected', () => {
  assert.throws(() => plan([fact(100,12.5)]),
    e => e instanceof A5Error && e.code === 'INVALID_FACT');
});
