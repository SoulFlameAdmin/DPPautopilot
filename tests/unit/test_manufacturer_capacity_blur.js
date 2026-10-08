'use strict';
// Regression tests execute the actual production input listener and async sync function.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../assets/csp/manufacturer-detail-hardening.js'), 'utf8');
const trackStart = source.indexOf('function trackPassportSelection(){');
const accessStart = source.indexOf('function accessToken(){', trackStart);
const syncStart = source.indexOf('async function syncPassportSpecificDetail(){');
const syncEnd = source.indexOf('\nif(qrState)qrState.id', syncStart);
assert.ok(trackStart >= 0 && accessStart > trackStart && syncStart > accessStart && syncEnd > syncStart,
  'actual production listener and async function must be present');

function harness({focused = false} = {}) {
  let id = 'P-001';
  let onInput;
  const input = {
    value: '101',
    addEventListener(type, handler) { if (type === 'input') onInput = handler; }
  };
  const label = {textContent: ''};
  const document = {activeElement: focused ? input : null};
  const pending = [];
  const factory = new Function(
    'selectedPassportId', 'accessToken', 'setQrState', 'fetch',
    'capacityNode', 'capacityInput', 'active', 'document',
    'let requestVersion=0;let trackedPassportId="";let dirtyCapacityPassportId="";' +
      source.slice(trackStart, accessStart) + source.slice(syncStart, syncEnd) +
      ';return syncPassportSpecificDetail;'
  );
  const sync = factory(
    () => id, () => 'test-token', () => {},
    () => new Promise(resolve => pending.push(resolve)),
    label, input, () => true, document
  );
  assert.equal(typeof onInput, 'function', 'real input event listener must register');
  return {
    input, label, pending, sync, document,
    edit(value) { input.value = value; onInput(); },
    setId(value) { id = value; },
    respond(value) {
      const resolve = pending.shift();
      assert.ok(resolve, 'expected a pending API response');
      resolve({ok: true, json: async () => ({data: {public_payload: {model: {rated_capacity_ah: value}}}})});
    }
  };
}

test('late 101 Ah API response does not overwrite unsaved 125 Ah after blur', async () => {
  const h = harness({focused: true});
  const request = h.sync();
  h.edit('125');
  h.document.activeElement = null;
  h.respond(101);
  await request;
  assert.equal(h.label.textContent, '101 Ah');
  assert.equal(h.input.value, '125');
});

test('changing selected passport ignores stale response and accepts new 90 Ah', async () => {
  const h = harness();
  const old = h.sync();
  h.edit('125');
  h.setId('P-002');
  const fresh = h.sync();
  h.respond(101);
  await old;
  assert.equal(h.input.value, '125', 'stale P-001 response must not update P-002');
  h.respond(90);
  await fresh;
  assert.equal(h.input.value, '90');
  assert.equal(h.label.textContent, '90 Ah');
});

test('untouched, unfocused field hydrates from selected passport', async () => {
  const h = harness();
  const request = h.sync();
  h.respond(101);
  await request;
  assert.equal(h.input.value, '101');
  assert.equal(h.label.textContent, '101 Ah');
});
