'use strict';

/**
 * SOULFLAME DPP AI-first intake contract v0.
 *
 * The first contract deliberately mirrors the eight fields already used by the
 * manufacturer Early Access wizard so AI mode and manual mode feed the same
 * downstream onboarding flow. An LLM may propose candidates, but AI inference
 * is never factual provenance and can never make onboarding ready by itself.
 */

const ALLOWED_SOURCE_TYPES = new Set(['user', 'document', 'system', 'integration']);

const MODULES = Object.freeze({
  battery: Object.freeze([
    Object.freeze({ key: 'country', question: 'В коя държава е регистрирана фирмата?' }),
    Object.freeze({ key: 'company', question: 'Как се казва фирмата / производителят?' }),
    Object.freeze({ key: 'products', question: 'Какво точно произвеждате?' }),
    Object.freeze({ key: 'sku', question: 'Колко модела / SKU имате приблизително?' }),
    Object.freeze({ key: 'annualVolume', question: 'Какъв е приблизителният ви годишен производствен обем?' }),
    Object.freeze({ key: 'users', question: 'Кои хора ще работят с DPP системата?' }),
    Object.freeze({ key: 'systems', question: 'Какви системи и данни използвате в момента?' }),
    Object.freeze({ key: 'automation', question: 'Какво искате SoulFlame DPP да автоматизира или реши за вас?' })
  ])
});

class IntakeContractError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'IntakeContractError';
    this.code = code;
    this.field = field;
  }
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function validateFact(key, fact) {
  if (!plainObject(fact)) {
    throw new IntakeContractError('INVALID_FACT', `Fact ${key} must be an object.`, key);
  }
  if (!hasValue(fact.value)) {
    throw new IntakeContractError('MISSING_FACT_VALUE', `Fact ${key} has no value.`, key);
  }
  if (!ALLOWED_SOURCE_TYPES.has(fact.source_type)) {
    throw new IntakeContractError(
      'UNTRUSTED_PROVENANCE',
      `Fact ${key} must come from user, document, system, or integration evidence.`,
      key
    );
  }
  if (typeof fact.source_ref !== 'string' || fact.source_ref.trim().length === 0) {
    throw new IntakeContractError('MISSING_SOURCE_REF', `Fact ${key} requires a source_ref.`, key);
  }
  if (typeof fact.verified !== 'boolean') {
    throw new IntakeContractError('MISSING_VERIFICATION_STATE', `Fact ${key} requires verified=true/false.`, key);
  }
  return {
    value: cloneJson(fact.value),
    source_type: fact.source_type,
    source_ref: fact.source_ref.trim(),
    verified: fact.verified
  };
}

function normalizeFacts(moduleKey, facts) {
  if (facts === undefined || facts === null) return {};
  if (!plainObject(facts)) {
    throw new IntakeContractError('INVALID_FACTS', 'facts must be an object.');
  }
  const allowedKeys = new Set(MODULES[moduleKey].map(item => item.key));
  const normalized = {};
  for (const [key, fact] of Object.entries(facts)) {
    if (!allowedKeys.has(key)) {
      throw new IntakeContractError('UNKNOWN_FACT', `Unknown fact for ${moduleKey}: ${key}`, key);
    }
    normalized[key] = validateFact(key, fact);
  }
  return normalized;
}

function buildIntakeState(input = {}) {
  if (!plainObject(input)) {
    throw new IntakeContractError('INVALID_INPUT', 'Input must be an object.');
  }

  const moduleKey = input.module || 'battery';
  if (!Object.prototype.hasOwnProperty.call(MODULES, moduleKey)) {
    throw new IntakeContractError('UNSUPPORTED_MODULE', `Unsupported regulatory module: ${moduleKey}`);
  }

  const mode = input.mode === 'manual' ? 'manual' : 'ai';
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (mode === 'ai' && !prompt) {
    throw new IntakeContractError('PROMPT_REQUIRED', 'AI mode requires a non-empty prompt.');
  }
  if (input.human_approved !== undefined && typeof input.human_approved !== 'boolean') {
    throw new IntakeContractError('INVALID_APPROVAL', 'human_approved must be boolean when supplied.');
  }

  const facts = normalizeFacts(moduleKey, input.facts);
  const definitions = MODULES[moduleKey];
  const missing = [];
  const unverified = [];

  for (const definition of definitions) {
    const fact = facts[definition.key];
    if (!fact) {
      missing.push(definition);
    } else if (!fact.verified) {
      unverified.push(definition);
    }
  }

  const missingKeys = new Set(missing.map(item => item.key));
  const questions = [...missing, ...unverified].map(definition => ({
    key: definition.key,
    question: definition.question,
    reason: missingKeys.has(definition.key) ? 'missing' : 'unverified'
  }));

  const allVerified = missing.length === 0 && unverified.length === 0;
  const humanApproved = input.human_approved === true;
  let status = 'collecting';
  if (allVerified && !humanApproved) status = 'review_required';
  if (allVerified && humanApproved) status = 'ready_for_generation';

  return {
    contract_version: 1,
    module: moduleKey,
    onboarding_schema: 'manufacturer-early-v2',
    mode,
    prompt,
    facts,
    missing_fields: missing.map(item => item.key),
    unverified_fields: unverified.map(item => item.key),
    questions,
    status,
    can_generate: status === 'ready_for_generation',
    can_publish: false,
    manual_mode_available: true,
    human_approval_required: true,
    policy: {
      ai_inference_is_evidence: false,
      every_fact_requires_provenance: true,
      every_fact_requires_verification: true,
      publication_requires_separate_validation: true
    }
  };
}

module.exports = {
  ALLOWED_SOURCE_TYPES,
  MODULES,
  IntakeContractError,
  buildIntakeState,
  _test: { plainObject, hasValue, validateFact, normalizeFacts }
};
