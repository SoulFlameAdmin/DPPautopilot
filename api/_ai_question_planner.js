'use strict';

/**
 * Deterministic A4 question fallback for the eight manufacturer onboarding
 * fields. Does not classify batteries, certify compliance, save data, invoke AI,
 * generate a battery DPP, or publish any product passport.
 * Facts and conflicts must originate from an authenticated, tenant-scoped
 * server projection. Never allow clients to mark facts verified themselves.
 */
const { MODULES, buildIntakeState } = require('./_ai_intake_contract.js');
const FIELDS = Object.freeze(MODULES.battery.map(item => item.key));
const FIELD_SET = new Set(FIELDS);
const MAX_QUESTIONS = FIELDS.length;
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

function questionPlan({ facts = {}, conflicts = [], language = 'bg', limit = MAX_QUESTIONS } = {}) {
  if (!plainObject(facts)) fail('INVALID_FACTS');
  if (!Array.isArray(conflicts) || conflicts.some(key => !FIELD_SET.has(key)) ||
      new Set(conflicts).size !== conflicts.length) fail('INVALID_CONFLICTS');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUESTIONS) fail('INVALID_LIMIT');
  if (language !== 'bg' && language !== 'en') fail('UNSUPPORTED_LANGUAGE');

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
    return {
      key, reason, position: index + 1,
      question: language === 'bg' ? localeQuestions.get(key) : EN[key],
      explanation: REASONS[reason][language],
      action: reason === 'conflict' ? 'resolve_conflict' : reason === 'unverified' ? 'review' : 'answer',
      requires_human_input: true
    };
  });
  const total = uniquePriority.length;
  return {
    schema: 'manufacturer-early-v2', locale: language,
    next_question: entries[0] || null, questions: entries,
    unresolved_count: total, remaining_after_page: total - entries.length,
    needs_user_input: total > 0,
    // Even 8/8 verified does not constitute a complete battery passport.
    onboarding_review_required: total === 0,
    can_generate_battery_passport: false,
    can_publish: false,
    deterministic_fallback: true
  };
}
module.exports = { QuestionPlanError, questionPlan };
