'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../../data/sample-battery.json');
const {
  sanitizePublicPayload,
  findRestrictedPublicPaths,
} = require('../../api/_access_policy.js');

const MODEL_ID = 'SFBG-ESS-100-DEMO';
const markerValues = [
  fixture.model.restricted_composition?.cathode,
  fixture.model.safety_measures?.transport,
  fixture.model.compliance_test_reports?.[0]?.document_ref,
].filter(Boolean).map(String);

function payloadFor(serial) {
  const model = JSON.parse(JSON.stringify(fixture.model));
  model.identification.category = 'industrial';
  model.identification.model_id = MODEL_ID;
  const item = JSON.parse(JSON.stringify(fixture.items[0]));
  item.unique_identifier = `urn:dpp:pilot:bg:battery:${MODEL_ID}:${String(serial).padStart(6, '0')}`;
  return { model, item };
}

test('BG03 public projection removes every restricted/authority/item-private catalog field for all 10 pilot items', () => {
  for (let serial = 1; serial <= 10; serial += 1) {
    const source = payloadFor(serial);
    const projected = sanitizePublicPayload(source);
    assert.deepEqual(findRestrictedPublicPaths(projected), []);
    assert.equal(projected.item.unique_identifier, source.item.unique_identifier);
    assert.equal(projected.model.identification.model_id, MODEL_ID);
    const text = JSON.stringify(projected);
    for (const marker of markerValues) assert.equal(text.includes(marker), false, `restricted marker leaked for item ${serial}: ${marker}`);
    assert.equal(Object.hasOwn(projected.item, 'state_of_health'), false);
    assert.equal(Object.hasOwn(projected.item, 'performance_history'), false);
    assert.equal(Object.hasOwn(projected.model, 'restricted_composition'), false);
    assert.equal(Object.hasOwn(projected.model, 'compliance_test_reports'), false);
  }
});
