'use strict';

/**
 * SOULFLAME DPP AI-first intake contract v0.
 *
 * This module is intentionally model-provider agnostic. An LLM may propose
 * candidate facts, but this contract only accepts facts that are bound to an
 * allowed source and explicitly verified. AI inference is never a source of
 * truth and can never make a passport ready by itself.
 */

const ALLOWED_SOURCE_TYPES = new Set(['user', 'document', 'system', 'integration']);

const MODULES = Object.freeze({
  battery: Object.freeze([
    Object.freeze({ key: 'company_role', question: 'Каква е ролята на фирмата за този продукт?' }),
    Object.freeze({ key: 'product_category', question: 'Каква е точната продуктова категория?' }),
    Object.freeze({ key: 'battery_type', question: 'Какъв тип батерия е продуктът?' }),
    Object.freeze({ key: 'manufacturer_name', question: 'Кой е производителят?' }),
    Object.freeze({ key: 'model_name', question: 'Как се казва моделът или продуктовата линия?' }),
    Object.freeze({ key: 'market_scope', question: 'На кои пазари ще се пуска продуктът?' }),
    Object.freeze({ key: 'data_sources', question: 'Какви източници на данни и доказателства имате?' }),
    Object.freeze({ key: 'goal', question: 'Какво искате системата да подготви или публикува?' })
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

  const questions = [...missing, ...unverified].map(definition => ({
    key: definition.key,
    question: definition.question,
    reason: missing.some(item => item.key === definition.key) ? 'missing' : 'unverified'
  }));

  const allVerified = missing.length === 0 && unverified.length === 0;
  const humanApproved = input.human_approved === true;
  let status = 'collecting';
  if (allVerified && !humanApproved) status = 'review_required';
  if (allVerified && humanApproved) status = 'ready_for_generation';

  return {
    contract_version: 1,
    module: moduleKey,
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
