'use strict';

const {
  AIPersistenceError,
  ONBOARDING_KEYS,
  validUuid,
  resolveRequestId,
  rpc
} = require('./_ai_intake_persistence.js');

const ONBOARDING_KEY_SET = new Set(ONBOARDING_KEYS);

async function createManualCandidateCas({
  sessionId,
  fieldKey,
  value,
  expectedRevision,
  requestId
}, options = {}) {
  const cleanValue = typeof value === 'string' ? value.trim() : '';
  if (!validUuid(sessionId) || !ONBOARDING_KEY_SET.has(fieldKey) || !cleanValue || cleanValue.length > 5000 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new AIPersistenceError('AI_INTAKE_INVALID_MANUAL_CANDIDATE', 'Manual AI intake candidate is invalid.', 422);
  }

  return rpc('dpp_api_ai_intake_manual_candidate_cas', {
    p_session_id: sessionId,
    p_field_key: fieldKey,
    p_value: cleanValue,
    p_expected_revision: expectedRevision,
    p_request_id: resolveRequestId(requestId)
  }, options);
}

module.exports = { createManualCandidateCas };
