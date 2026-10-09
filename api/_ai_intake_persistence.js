'use strict';

const { randomUUID } = require('node:crypto');
const { getSupabaseConfig } = require('./_supabase_config.js');

const PERSISTENCE_TIMEOUT_MS = 8000;
const ONBOARDING_KEYS = Object.freeze([
  'country','company','products','sku','annualVolume','users','systems','automation'
]);
const ONBOARDING_KEY_SET = new Set(ONBOARDING_KEYS);

class AIPersistenceError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'AIPersistenceError';
    this.code = code;
    this.status = status;
  }
}

function persistenceEnabled(env = process.env) {
  return String(env.AI_INTAKE_PERSISTENCE_ENABLED || '').trim().toLowerCase() === 'true';
}

function requireAuthorization(authorization) {
  if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw new AIPersistenceError('AUTH_REQUIRED', 'Bearer authentication is required.', 401);
  }
  return authorization;
}

function validUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requestId(value) {
  if (value === undefined || value === null || value === '') return randomUUID();
  if (!validUuid(value)) {
    throw new AIPersistenceError('AI_INTAKE_INVALID_REQUEST_ID', 'AI intake request id is invalid.', 422);
  }
  return value;
}

async function rpc(name, args, {
  authorization,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = PERSISTENCE_TIMEOUT_MS
} = {}) {
  if (!persistenceEnabled(env)) {
    throw new AIPersistenceError(
      'AI_PERSISTENCE_NOT_ENABLED',
      'AI intake persistence is not enabled.',
      503
    );
  }
  requireAuthorization(authorization);
  if (typeof fetchImpl !== 'function') {
    throw new AIPersistenceError('AI_PERSISTENCE_RUNTIME_UNAVAILABLE', 'Persistence runtime is unavailable.', 500);
  }

  const { base, key } = getSupabaseConfig(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${base.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(args || {}),
      cache: 'no-store',
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new AIPersistenceError('AI_PERSISTENCE_TIMEOUT', 'AI intake persistence timed out.', 504);
    }
    throw new AIPersistenceError('AI_PERSISTENCE_UNAVAILABLE', 'AI intake persistence is unavailable.', 503);
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new AIPersistenceError('AUTH_INVALID', 'Authentication is invalid or expired.', 401);
  }
  if (!response.ok) {
    const dbCode = typeof payload?.code === 'string' ? payload.code : '';
    if (dbCode === 'DP404') {
      throw new AIPersistenceError('AI_INTAKE_NOT_FOUND', 'AI intake state was not found.', 404);
    }
    if (dbCode === 'DP104' || dbCode === 'DP102' || dbCode === 'DP103') {
      throw new AIPersistenceError('AI_INTAKE_FORBIDDEN', 'AI intake state is not available for this tenant.', 403);
    }
    if (dbCode === 'DP501') {
      throw new AIPersistenceError('AI_INTAKE_INVALID', 'AI intake persistence rejected invalid data.', 422);
    }
    if (dbCode === 'DP409') {
      throw new AIPersistenceError('AI_INTAKE_REVISION_CONFLICT', 'AI intake state changed. Reload the latest review state and retry.', 409);
    }
    throw new AIPersistenceError('AI_PERSISTENCE_ERROR', 'AI intake persistence failed.', 502);
  }
  return payload;
}

async function resumeOrCreate(options = {}) {
  const session = await rpc('dpp_api_ai_intake_resume_or_create', {}, options);
  if (!session || !validUuid(session.id) || !Number.isSafeInteger(Number(session.revision))) {
    throw new AIPersistenceError('AI_PERSISTENCE_INVALID_RESPONSE', 'AI intake persistence returned an invalid session.', 502);
  }
  return session;
}

function normalizeCandidates(candidates, sourceRef) {
  if (!Array.isArray(candidates) || candidates.length > ONBOARDING_KEYS.length) {
    throw new AIPersistenceError('AI_PERSISTENCE_INVALID_CANDIDATES', 'AI candidates are invalid.', 500);
  }
  const seen = new Set();
  return candidates.map(candidate => {
    const key = String(candidate?.key || '').trim();
    const value = String(candidate?.value || '').trim();
    const evidence = String(candidate?.evidence || '').trim();
    if (!ONBOARDING_KEY_SET.has(key) || !value || !evidence || seen.has(key)) {
      throw new AIPersistenceError('AI_PERSISTENCE_INVALID_CANDIDATES', 'AI candidates are invalid.', 500);
    }
    seen.add(key);
    return {
      key,
      value,
      evidence,
      source_type: 'user',
      source_ref: sourceRef
    };
  });
}

async function persistExtractedTurn({
  authorization,
  prompt,
  candidates,
  model,
  sourceRef = 'conversation:prompt',
  requestId,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!persistenceEnabled(env)) return { enabled: false };
  const session = await resumeOrCreate({ authorization, env, fetchImpl });
  const normalized = normalizeCandidates(candidates, sourceRef);
  const idempotencyKey = requestId === undefined ? requestId : requestId;
  const resolvedRequestId = requestId === undefined ? randomUUID() : requestId;
  if (!validUuid(resolvedRequestId)) {
    throw new AIPersistenceError('AI_INTAKE_INVALID_REQUEST_ID', 'AI intake request id is invalid.', 422);
  }
  const expectedRevision = Number(session.revision);
  const saved = await rpc('dpp_api_ai_intake_turn_save_cas', {
    p_session_id: session.id,
    p_expected_revision: expectedRevision,
    p_request_id: resolvedRequestId,
    p_prompt: String(prompt || '').trim(),
    p_candidates: normalized,
    p_model_id: String(model || '').trim() || null,
    p_source_ref: sourceRef
  }, { authorization, env, fetchImpl });

  return {
    enabled: true,
    session_id: session.id,
    request_id: saved?.request_id || resolvedRequestId,
    expected_revision: expectedRevision,
    revision: Number(saved?.revision),
    message_id: saved?.message_id || null,
    candidate_ids: Array.isArray(saved?.candidate_ids) ? saved.candidate_ids : [],
    event_ids: Array.isArray(saved?.event_ids) ? saved.event_ids : [],
    saved_candidates: Number(saved?.saved_candidates || 0),
    verification_state: saved?.verification_state || 'unverified',
    idempotent_retry: saved?.idempotent_retry === true,
    canonical_answers_written: false,
    can_generate_battery_passport: false,
    can_publish: false
  };
}

async function snapshot(sessionId, options = {}) {
  if (!validUuid(sessionId)) {
    throw new AIPersistenceError('AI_INTAKE_INVALID_SESSION', 'AI intake session id is invalid.', 422);
  }
  return rpc('dpp_api_ai_intake_snapshot', { p_session_id: sessionId }, options);
}

// Legacy review helper retained during Draft integration. CAS callers should use reviewCandidateCas.
async function reviewCandidate({ sessionId, fieldKey, approvedValue, accept }, options = {}) {
  if (!validUuid(sessionId) || !ONBOARDING_KEY_SET.has(fieldKey) || typeof accept !== 'boolean') {
    throw new AIPersistenceError('AI_INTAKE_INVALID_REVIEW', 'AI intake review is invalid.', 422);
  }
  const value = typeof approvedValue === 'string' ? approvedValue.trim() : '';
  if (accept && (!value || value.length > 5000)) {
    throw new AIPersistenceError('AI_INTAKE_INVALID_REVIEW', 'Approved AI intake value is invalid.', 422);
  }
  return rpc('dpp_api_ai_intake_candidate_review', {
    p_session_id: sessionId,
    p_field_key: fieldKey,
    p_approved_value: accept ? value : null,
    p_accept: accept
  }, options);
}

async function reviewCandidateCas({
  sessionId,
  candidateId,
  accept,
  expectedRevision,
  requestId: suppliedRequestId
}, options = {}) {
  if (!validUuid(sessionId) || !validUuid(candidateId) || typeof accept !== 'boolean' ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new AIPersistenceError('AI_INTAKE_INVALID_REVIEW', 'AI intake CAS review is invalid.', 422);
  }
  const resolvedRequestId = requestId(suppliedRequestId);
  return rpc('dpp_api_ai_intake_candidate_review_cas', {
    p_session_id: sessionId,
    p_candidate_id: candidateId,
    p_accept: accept,
    p_expected_revision: expectedRevision,
    p_request_id: resolvedRequestId
  }, options);
}

async function approveSessionCas({ sessionId, expectedRevision, requestId: suppliedRequestId }, options = {}) {
  if (!validUuid(sessionId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new AIPersistenceError('AI_INTAKE_INVALID_APPROVAL', 'AI intake final approval is invalid.', 422);
  }
  const resolvedRequestId = requestId(suppliedRequestId);
  return rpc('dpp_api_ai_intake_session_approve_cas', {
    p_session_id: sessionId,
    p_expected_revision: expectedRevision,
    p_request_id: resolvedRequestId
  }, options);
}

module.exports = {
  PERSISTENCE_TIMEOUT_MS,
  ONBOARDING_KEYS,
  AIPersistenceError,
  persistenceEnabled,
  validUuid,
  requestId,
  rpc,
  resumeOrCreate,
  normalizeCandidates,
  persistExtractedTurn,
  snapshot,
  reviewCandidate,
  reviewCandidateCas,
  approveSessionCas
};
