'use strict';

const { MODULES } = require('./_ai_intake_contract.js');

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/responses';
const DEFAULT_MODEL = 'openai/gpt-5.6-sol';
const MAX_PROMPT_CHARS = 20000;
const REQUEST_TIMEOUT_MS = 15000;
const ONBOARDING_KEYS = Object.freeze(MODULES.battery.map(item => item.key));
const ONBOARDING_KEY_SET = new Set(ONBOARDING_KEYS);

class AIExtractorError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'AIExtractorError';
    this.code = code;
    this.status = status;
  }
}

function getGatewayConfig(env = process.env) {
  const token = String(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || '').trim();
  const model = String(env.AI_GATEWAY_MODEL || DEFAULT_MODEL).trim();
  if (!token) {
    throw new AIExtractorError(
      'AI_NOT_CONFIGURED',
      'AI Gateway authentication is not configured.',
      503
    );
  }
  if (!/^[^\s/]+\/[^\s/]+$/.test(model)) {
    throw new AIExtractorError(
      'AI_MODEL_INVALID',
      'AI_GATEWAY_MODEL must be a provider/model identifier.',
      500
    );
  }
  return { token, model };
}

function candidateSchema() {
  return {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        maxItems: ONBOARDING_KEYS.length,
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ONBOARDING_KEYS },
            value: { type: 'string', minLength: 1, maxLength: 5000 },
            evidence: { type: 'string', minLength: 1, maxLength: 1000 }
          },
          required: ['key', 'value', 'evidence'],
          additionalProperties: false
        }
      }
    },
    required: ['candidates'],
    additionalProperties: false
  };
}

function buildGatewayBody(prompt, model) {
  return {
    model,
    instructions: [
      'You extract manufacturer onboarding facts for SOULFLAME DPP.',
      'Return only facts explicitly stated by the user. Never infer, estimate, complete, normalize into a new fact, or guess missing information.',
      'Omit a key when the prompt does not explicitly answer it.',
      'The evidence field must be a short exact fragment or faithful minimal excerpt from the user prompt that supports the candidate.',
      'Do not claim legal compliance, certification, readiness, or verification.',
      'The eight allowed keys correspond to: country, company, products, sku, annualVolume, users, systems, automation.'
    ].join(' '),
    input: prompt,
    max_output_tokens: 1500,
    text: {
      format: {
        type: 'json_schema',
        name: 'soulflame_manufacturer_intake_candidates',
        strict: true,
        schema: candidateSchema()
      }
    }
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const chunks = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part?.text === 'string') {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('').trim();
}

function validateCandidatePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.candidates)) {
    throw new AIExtractorError('AI_OUTPUT_INVALID', 'AI returned an invalid candidate envelope.', 502);
  }
  if (value.candidates.length > ONBOARDING_KEYS.length) {
    throw new AIExtractorError('AI_OUTPUT_INVALID', 'AI returned too many onboarding candidates.', 502);
  }

  const seen = new Set();
  const candidates = [];
  for (const candidate of value.candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new AIExtractorError('AI_OUTPUT_INVALID', 'AI returned an invalid candidate.', 502);
    }
    const key = String(candidate.key || '').trim();
    const factValue = String(candidate.value || '').trim();
    const evidence = String(candidate.evidence || '').trim();
    if (!ONBOARDING_KEY_SET.has(key) || !factValue || !evidence) {
      throw new AIExtractorError('AI_OUTPUT_INVALID', 'AI returned an unsupported or empty candidate.', 502);
    }
    if (seen.has(key)) {
      throw new AIExtractorError('AI_OUTPUT_INVALID', `AI returned duplicate candidate: ${key}`, 502);
    }
    if (factValue.length > 5000 || evidence.length > 1000) {
      throw new AIExtractorError('AI_OUTPUT_INVALID', `AI candidate exceeds limits: ${key}`, 502);
    }
    seen.add(key);
    candidates.push({ key, value: factValue, evidence });
  }
  return candidates;
}

function candidatesToUnverifiedFacts(candidates, sourceRef = 'conversation:prompt') {
  return Object.fromEntries(candidates.map(candidate => [candidate.key, {
    value: candidate.value,
    source_type: 'user',
    source_ref: sourceRef,
    verified: false
  }]));
}

async function extractPromptCandidates({
  prompt,
  env = process.env,
  fetchImpl = globalThis.fetch,
  sourceRef = 'conversation:prompt'
} = {}) {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) {
    throw new AIExtractorError('PROMPT_REQUIRED', 'A non-empty prompt is required.', 400);
  }
  if (text.length > MAX_PROMPT_CHARS) {
    throw new AIExtractorError('PROMPT_TOO_LARGE', `Prompt exceeds ${MAX_PROMPT_CHARS} characters.`, 413);
  }
  if (typeof fetchImpl !== 'function') {
    throw new AIExtractorError('AI_RUNTIME_UNAVAILABLE', 'fetch is not available in this runtime.', 500);
  }

  const { token, model } = getGatewayConfig(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(buildGatewayBody(text, model)),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AIExtractorError('AI_TIMEOUT', 'AI Gateway request timed out.', 504);
    }
    throw new AIExtractorError('AI_UPSTREAM_UNAVAILABLE', 'AI Gateway request failed.', 502);
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AIExtractorError('AI_AUTH_FAILED', 'AI Gateway authentication failed.', 503);
    }
    if (response.status === 429) {
      throw new AIExtractorError('AI_RATE_LIMITED', 'AI Gateway rate limit reached.', 429);
    }
    throw new AIExtractorError('AI_UPSTREAM_ERROR', `AI Gateway returned HTTP ${response.status}.`, 502);
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new AIExtractorError('AI_OUTPUT_EMPTY', 'AI returned no structured output.', 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AIExtractorError('AI_OUTPUT_INVALID_JSON', 'AI returned invalid JSON.', 502);
  }

  const candidates = validateCandidatePayload(parsed);
  return {
    model,
    candidates,
    facts: candidatesToUnverifiedFacts(candidates, sourceRef)
  };
}

module.exports = {
  GATEWAY_URL,
  DEFAULT_MODEL,
  MAX_PROMPT_CHARS,
  ONBOARDING_KEYS,
  AIExtractorError,
  getGatewayConfig,
  candidateSchema,
  buildGatewayBody,
  extractOutputText,
  validateCandidatePayload,
  candidatesToUnverifiedFacts,
  extractPromptCandidates
};
