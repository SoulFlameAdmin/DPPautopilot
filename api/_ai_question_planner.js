'use strict';

/**
 * Deterministic A4 question fallback for the eight manufacturer onboarding
 * fields. Does not classify batteries, certify compliance, save data, invoke AI,
 * generate a battery DPP, or publish any product passport.
 * Facts, conflicts and optional review choices must originate from an
 * authenticated, tenant-scoped server projection. Never allow clients to mark
 * facts or review choices verified themselves.
 */
const { MODULES, buildIntakeState } = require('./_ai_intake_contract.js');
const FIELDS = Object.freeze(MODULES.battery.map(item => item.key));
const FIELD_SET = new Set(FIELDS);
const MAX_QUESTIONS = FIELDS.length;
const MAX_CHOICES_PER_FIELD = 1000;
const EN = Object.freeze({
  country: 'In which country is your company registered?',
  company: 'What is the legal name of the manufacturer?',
  products: 'Which products does your company manufacture?',
  sku: 'Approximately how many models or SKUs do you have?',
  annualVolume: 'What is your approximate annual production volume?',
  users: 'Which people will use the DPP system?',
  systems: 'Which existing systems or data sources do you use?',
  automation: 'What would you like SoulFlame DPP to automate for you?'
});
const REASONS = Object.freeze({
  missing: {bg: 'Няма предоставена стойност.', en: 'No value has been provided.'},
  unverified: {bg: 'Има предложена стойност, която трябва да потвърдите или коригирате.',
    en: 'A suggested value needs your confirmation or correction.'},
  conflict: {bg: 'Източниците съдържат различни стойности. Изберете или коригирайте верния вариант.',
    en: 'Sources disagree. Choose or correct the authoritative value.'}
});
class QuestionPlanError extends Error {
  constructor(code) { super(code); this.name = 'QuestionPlanError'; this.code = code; }
}
const fail = code => { throw new QuestionPlanError(code); };
const plainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

function normalizeReviewChoice(choice) {
  if (!plainObject(choice) || typeof choice.value !== 'string' || !choice.value.trim() ||
      choice.value.length > 5000 || choice.verified !== false) fail('INVALID_CHOICES');
  const output = { value: choice.value, verified: false };
  if (choice.source_type !== undefined) {
    if (typeof choice.source_type !== 'string' || !choice.source_type || choice.source_type.length > 64)
      fail('INVALID_CHOICES');
    output.source_type = choice.source_type;
  }
  if (choice.source_ref !== undefined) {
    if (typeof choice.source_ref !== 'string' || !choice.source_ref || choice.source_ref.length > 512)
      fail('INVALID_CHOICES');
    output.source_ref = choice.source_ref;
  }
  if (choice.source_digest !== undefined) {
    if (typeof choice.source_digest !== 'string' || !/^[a-f0-9]{64}$/i.test(choice.source_digest))
      fail('INVALID_CHOICES');
    output.source_digest = choice.source_digest.toLowerCase();
  }
  if (choice.source_anchor !== undefined) {
    if (!plainObject(choice.source_anchor)) fail('INVALID_CHOICES');
    const allowed = new Set(['page','line','row','column','sheet']);
    if (Object.keys(choice.source_anchor).some(key => !allowed.has(key))) fail('INVALID_CHOICES');
    output.source_anchor = { ...choice.source_anchor };
  }
  return output;
}

function normalizeChoices(choices) {
  if (!plainObject(choices)) fail('INVALID_CHOICES');
  const normalized = {};
  for (const [key, values] of Object.entries(choices)) {
    if (!FIELD_SET.has(key) || !Array.isArray(values) || values.length > MAX_CHOICES_PER_FIELD)
      fail('INVALID_CHOICES');
    normalized[key] = values.map(normalizeReviewChoice);
  }
  return normalized;
}

function questionPlan({ facts = {}, conflicts = [], choices = {}, language = 'bg', limit = MAX_QUESTIONS } = {}) {
  if (!plainObject(facts)) fail('INVALID_FACTS');
  if (!Array.isArray(conflicts) || conflicts.some(key => !FIELD_SET.has(key)) ||
      new Set(conflicts).size !== conflicts.length) fail('INVALID_CONFLICTS');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUESTIONS) fail('INVALID_LIMIT');
  if (language !== 'bg' && language !== 'en') fail('UNSUPPORTED_LANGUAGE');
  const reviewChoices = normalizeChoices(choices);

  // Existing contract remains authoritative; no separate invented checklist.
  let state;
  try {
    const reviewFacts = {};
    for (const [key, fact] of Object.entries(facts)) {
      if (!FIELD_SET.has(key) || !plainObject(fact)) fail('INVALID_FACTS');
      reviewFacts[key] = { ...fact, verified: conflicts.includes(key) ? false : fact.verified };
    }
    state = buildIntakeState({ module: 'battery', mode: 'manual', facts: reviewFacts });
  } catch (error) {
    if (error instanceof QuestionPlanError) throw error;
    fail('INVALID_FACTS');
  }

  const missing = new Set(state.missing_fields);
  const unverified = new Set(state.unverified_fields);
  const conflict = new Set(conflicts);
  const priority = [
    ...FIELDS.filter(key => conflict.has(key)),
    ...FIELDS.filter(key => missing.has(key) && !conflict.has(key)),
    ...FIELDS.filter(key => unverified.has(key) && !conflict.has(key))
  ];
  const uniquePriority = [...new Set(priority)];
  const localeQuestions = new Map(MODULES.battery.map(item => [item.key, item.question]));
  const entries = uniquePriority.slice(0, limit).map((key, index) => {
    const reason = conflict.has(key) ? 'conflict' : missing.has(key) ? 'missing' : 'unverified';
    const allowedActions = reason === 'conflict' ? ['choose','correct','reject'] :
      reason === 'unverified' ? ['confirm','correct','reject'] : ['answer'];
    return {
      key, reason, position: index + 1,
      question: language === 'bg' ? localeQuestions.get(key) : EN[key],
      explanation: REASONS[reason][language],
      action: reason === 'conflict' ? 'resolve_conflict' : reason === 'unverified' ? 'review' : 'answer',
      choices: reviewChoices[key] || [],
      allowed_actions: allowedActions,
      requires_human_input: true
    };
  });
  const total = uniquePriority.length;
  return {
    schema: 'manufacturer-early-v2', locale: language,
    next_question: entries[0] || null, questions: entries,
    unresolved_count: total, remaining_after_page: total - entries.length,
    needs_user_input: total > 0,
    // Choice metadata is only review context. It never approves or mutates facts.
    review_choices_preserved: Object.keys(reviewChoices).length > 0,
    // Even 8/8 verified does not constitute a complete battery passport.
    onboarding_review_required: total === 0,
    can_generate_battery_passport: false,
    can_publish: false,
    deterministic_fallback: true
  };
}
module.exports = { QuestionPlanError, questionPlan };
