'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GATEWAY_URL,
  AIExtractorError,
  buildGatewayBody,
  validateCandidatePayload,
  extractPromptCandidates
} = require('../../api/_ai_prompt_extractor.js');
const { buildIntakeState } = require('../../api/_ai_intake_contract.js');

const ENV = {
  AI_GATEWAY_API_KEY: 'test-gateway-key',
  AI_GATEWAY_MODEL: 'provider/test-model'
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

test('gateway request uses strict structured output for only the existing onboarding keys', () => {
  const body = buildGatewayBody('We are Acme.', ENV.AI_GATEWAY_MODEL);
  assert.equal(body.model, 'provider/test-model');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema.properties.candidates.items.properties.key.enum, [
    'country', 'company', 'products', 'sku',
    'annualVolume', 'users', 'systems', 'automation'
  ]);
  assert.match(body.instructions, /Never infer/i);
});

test('extractor is disabled cleanly when no gateway credential is configured', async () => {
  await assert.rejects(
    extractPromptCandidates({ prompt: 'hello', env: {}, fetchImpl: async () => { throw new Error('must not run'); } }),
    error => error instanceof AIExtractorError && error.code === 'AI_NOT_CONFIGURED' && error.status === 503
  );
});

test('successful extraction converts candidates into unverified user-sourced facts', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return jsonResponse({
      output: [{
        content: [{
          type: 'output_text',
          text: JSON.stringify({
            candidates: [
              { key: 'company', value: 'Acme Battery', evidence: 'We are Acme Battery' },
              { key: 'products', value: 'e-bike battery packs', evidence: 'make e-bike battery packs' }
            ]
          })
        }]
      }]
    });
  };

  const result = await extractPromptCandidates({
    prompt: 'We are Acme Battery and make e-bike battery packs.',
    env: ENV,
    fetchImpl,
    sourceRef: 'conversation:message-42'
  });

  assert.equal(captured.url, GATEWAY_URL);
  assert.equal(captured.options.headers.Authorization, 'Bearer test-gateway-key');
  assert.equal(result.model, 'provider/test-model');
  assert.deepEqual(result.candidates.map(item => item.key), ['company', 'products']);
  assert.deepEqual(result.facts.company, {
    value: 'Acme Battery',
    source_type: 'user',
    source_ref: 'conversation:message-42',
    verified: false
  });
  assert.equal(result.facts.products.verified, false);
});

test('AI candidates feed the intake contract as unverified, never ready facts', async () => {
  const fetchImpl = async () => jsonResponse({
    output_text: JSON.stringify({
      candidates: [
        { key: 'company', value: 'Acme Battery', evidence: 'Acme Battery' },
        { key: 'country', value: 'Bulgaria', evidence: 'registered in Bulgaria' }
      ]
    })
  });

  const extracted = await extractPromptCandidates({
    prompt: 'Acme Battery is registered in Bulgaria.',
    env: ENV,
    fetchImpl
  });
  const state = buildIntakeState({
    prompt: 'Acme Battery is registered in Bulgaria.',
    facts: extracted.facts
  });

  assert.equal(state.status, 'collecting');
  assert.deepEqual(state.unverified_fields, ['country', 'company']);
  assert.ok(state.missing_fields.includes('products'));
  assert.equal(state.can_generate, false);
  assert.equal(state.can_publish, false);
});

test('unsupported or duplicate model output is rejected instead of silently accepted', () => {
  assert.throws(
    () => validateCandidatePayload({
      candidates: [{ key: 'legal_certified', value: 'yes', evidence: 'yes' }]
    }),
    error => error instanceof AIExtractorError && error.code === 'AI_OUTPUT_INVALID'
  );
  assert.throws(
    () => validateCandidatePayload({
      candidates: [
        { key: 'company', value: 'A', evidence: 'A' },
        { key: 'company', value: 'B', evidence: 'B' }
      ]
    }),
    error => error instanceof AIExtractorError && error.code === 'AI_OUTPUT_INVALID'
  );
});

test('gateway authentication failures are mapped without exposing response bodies or secrets', async () => {
  const fetchImpl = async () => jsonResponse({ detail: 'secret upstream payload' }, 401);
  await assert.rejects(
    extractPromptCandidates({ prompt: 'hello', env: ENV, fetchImpl }),
    error => error instanceof AIExtractorError &&
      error.code === 'AI_AUTH_FAILED' &&
      !error.message.includes('secret upstream payload') &&
      !error.message.includes('test-gateway-key')
  );
});

test('oversized prompts are rejected before any model request', async () => {
  let called = false;
  await assert.rejects(
    extractPromptCandidates({
      prompt: 'x'.repeat(20001),
      env: ENV,
      fetchImpl: async () => { called = true; return jsonResponse({}); }
    }),
    error => error instanceof AIExtractorError && error.code === 'PROMPT_TOO_LARGE'
  );
  assert.equal(called, false);
});
