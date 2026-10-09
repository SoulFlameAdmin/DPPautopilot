'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildIntakeState,
  IntakeContractError,
  MODULES
} = require('../../api/_ai_intake_contract.js');

function verifiedFacts() {
  const values = {
    country: 'Bulgaria, EU market',
    company: 'Example Battery Ltd',
    products: 'LMT and e-bike battery packs',
    sku: '12 active models',
    annualVolume: '25,000 units/year',
    users: 'Compliance, engineering and production; 8 users',
    systems: 'ERP, BMS exports, Excel and REST API',
    automation: 'Collect evidence, prepare DPP drafts, validate status and publish QR after approval'
  };
  return Object.fromEntries(
    MODULES.battery.map(item => [item.key, {
      value: values[item.key],
      source_type: 'user',
      source_ref: `conversation:${item.key}`,
      verified: true
    }])
  );
}

test('contract mirrors the existing eight-question manufacturer Early Access schema', () => {
  assert.deepEqual(MODULES.battery.map(item => item.key), [
    'country', 'company', 'products', 'sku',
    'annualVolume', 'users', 'systems', 'automation'
  ]);
});

test('one prompt starts in collecting state and asks only for unresolved facts', () => {
  const state = buildIntakeState({
    module: 'battery',
    prompt: 'We manufacture e-bike batteries and need digital product passports.'
  });
  assert.equal(state.onboarding_schema, 'manufacturer-early-v2');
  assert.equal(state.status, 'collecting');
  assert.equal(state.can_generate, false);
  assert.equal(state.can_publish, false);
  assert.equal(state.manual_mode_available, true);
  assert.equal(state.questions.length, MODULES.battery.length);
  assert.deepEqual(state.missing_fields, MODULES.battery.map(item => item.key));
});

test('verified sourced facts reduce questions deterministically', () => {
  const facts = verifiedFacts();
  delete facts.automation;
  facts.systems.verified = false;
  const state = buildIntakeState({
    prompt: 'Continue setup.',
    facts
  });
  assert.deepEqual(state.missing_fields, ['automation']);
  assert.deepEqual(state.unverified_fields, ['systems']);
  assert.deepEqual(state.questions.map(item => [item.key, item.reason]), [
    ['automation', 'missing'],
    ['systems', 'unverified']
  ]);
  assert.equal(state.status, 'collecting');
});

test('AI/model inference cannot be accepted as factual provenance', () => {
  const facts = verifiedFacts();
  facts.products = {
    value: 'Guessed battery category',
    source_type: 'ai',
    source_ref: 'model:guess',
    verified: true
  };
  assert.throws(
    () => buildIntakeState({ prompt: 'Infer the rest.', facts }),
    error => error instanceof IntakeContractError && error.code === 'UNTRUSTED_PROVENANCE'
  );
});

test('a fact without a source reference is rejected', () => {
  const facts = verifiedFacts();
  facts.company.source_ref = '   ';
  assert.throws(
    () => buildIntakeState({ prompt: 'Continue.', facts }),
    error => error instanceof IntakeContractError && error.code === 'MISSING_SOURCE_REF'
  );
});

test('all verified facts still require human review before generation', () => {
  const state = buildIntakeState({
    prompt: 'Build the passport draft.',
    facts: verifiedFacts()
  });
  assert.equal(state.status, 'review_required');
  assert.equal(state.can_generate, false);
  assert.equal(state.questions.length, 0);
  assert.equal(state.human_approval_required, true);
});

test('generation becomes available only after explicit human approval', () => {
  const state = buildIntakeState({
    prompt: 'Build the passport draft.',
    facts: verifiedFacts(),
    human_approved: true
  });
  assert.equal(state.status, 'ready_for_generation');
  assert.equal(state.can_generate, true);
  assert.equal(state.can_publish, false);
});

test('manual mode works without an AI prompt and keeps the same evidence rules', () => {
  const state = buildIntakeState({
    mode: 'manual',
    facts: verifiedFacts(),
    human_approved: true
  });
  assert.equal(state.mode, 'manual');
  assert.equal(state.prompt, '');
  assert.equal(state.status, 'ready_for_generation');
  assert.equal(state.policy.ai_inference_is_evidence, false);
});

test('unknown facts cannot silently enter the onboarding state', () => {
  const facts = verifiedFacts();
  facts.secret_guess = {
    value: 'something',
    source_type: 'user',
    source_ref: 'conversation:extra',
    verified: true
  };
  assert.throws(
    () => buildIntakeState({ prompt: 'Continue.', facts }),
    error => error instanceof IntakeContractError && error.code === 'UNKNOWN_FACT'
  );
});

test('builder does not mutate caller-owned fact objects', () => {
  const facts = verifiedFacts();
  const before = JSON.stringify(facts);
  const state = buildIntakeState({ prompt: 'Continue.', facts });
  state.facts.company.value = 'mutated output';
  assert.equal(JSON.stringify(facts), before);
});
