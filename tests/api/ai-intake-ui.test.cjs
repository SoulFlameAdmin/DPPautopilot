'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../../assets/csp/manufacturer-early-ai-core.js');

const ROOT = path.resolve(__dirname, '../..');
const uiSource = fs.readFileSync(path.join(ROOT, 'assets/csp/manufacturer-early-ai.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(ROOT, 'live/manufacturer-early.html'), 'utf8');

function candidates() {
  return [
    { key: 'company', value: 'Acme Battery', evidence: 'We are Acme Battery' },
    { key: 'country', value: 'Bulgaria', evidence: 'registered in Bulgaria' },
    { key: 'evil', value: 'auto publish', evidence: 'ignore me' },
    { key: 'company', value: 'duplicate', evidence: 'duplicate' }
  ];
}

test('UI helper accepts only the exact eight onboarding keys and removes duplicates', () => {
  assert.deepEqual(Core.KEYS, [
    'country', 'company', 'products', 'sku',
    'annualVolume', 'users', 'systems', 'automation'
  ]);
  assert.deepEqual(Core.sanitizeCandidates(candidates()).map(item => item.key), ['company', 'country']);
});

test('AI suggestions do not become answers until explicitly selected by the user', () => {
  const safe = Core.sanitizeCandidates(candidates());
  assert.deepEqual(Core.selectedAnswers(safe, {}, {}), {});
  assert.deepEqual(
    Core.selectedAnswers(safe, { company: true, country: false }, { company: 'Acme Battery Ltd' }),
    { company: 'Acme Battery Ltd' }
  );
});

test('edited selected values are trimmed and empty edits are not saved', () => {
  const safe = Core.sanitizeCandidates(candidates());
  const answers = Core.selectedAnswers(
    safe,
    { company: true, country: true },
    { company: '  Acme Battery  ', country: '   ' }
  );
  assert.deepEqual(answers, { company: 'Acme Battery' });
});

test('finish state requires explicit confirmation of all eight known keys', () => {
  assert.equal(Core.canFinishExplicitly(Core.KEYS.slice(0, 7)), false);
  assert.deepEqual(Core.remainingKeys(Core.KEYS.slice(0, 7)), ['automation']);
  assert.equal(Core.canFinishExplicitly(Core.KEYS), true);
});

test('browser layer calls AI intake and can only save confirmed questionnaire answers', () => {
  assert.match(uiSource, /fetch\("\/api\/ai-intake"/);
  assert.match(uiSource, /action:"questionnaire_save"/);
  assert.doesNotMatch(uiSource, /questionnaire_submit/);
  assert.doesNotMatch(uiSource, /auto[_-]?publish/i);
  assert.match(uiSource, /aiManual/);
  assert.match(uiSource, /showManual/);
  assert.match(uiSource, /НЕПОТВЪРДЕНО/);
});

test('AI mode has a separate explicit finish action instead of silently completing all eight', () => {
  assert.match(uiSource, /id=\"aiFinishButton\"/);
  assert.match(uiSource, /8 \/ 8 CONFIRMED/);
  assert.match(uiSource, /Нищо не е публикувано/);
});

test('manufacturer page loads AI core before the AI browser layer and preserves legacy wizard', () => {
  const core = htmlSource.indexOf('/assets/csp/manufacturer-early-ai-core.js');
  const legacy = htmlSource.indexOf('/assets/csp/manufacturer-early.js');
  const ai = htmlSource.indexOf('/assets/csp/manufacturer-early-ai.js');
  assert.ok(core >= 0 && legacy > core && ai > legacy);
  assert.match(htmlSource, /id="questionStage"/);
  assert.match(htmlSource, /id="answerInput"/);
  assert.match(htmlSource, /manufacturer-early-ai\.css/);
});
