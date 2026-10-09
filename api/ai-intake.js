'use strict';

const { getSupabaseConfig } = require('./_supabase_config.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const {
  enforceRateLimit,
  enforceSharedRateLimit,
  sharedRateLimitUnavailableBody,
  rateLimitBody
} = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const { buildIntakeState } = require('./_ai_intake_contract.js');
const {
  AIExtractorError,
  MAX_PROMPT_CHARS,
  extractPromptCandidates
} = require('./_ai_prompt_extractor.js');
const {
  AIPersistenceError,
  persistExtractedTurn
} = require('./_ai_intake_persistence.js');

const AUTH_TIMEOUT_MS = 8000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function bearer(req) {
  const value = req?.headers?.authorization ?? req?.headers?.Authorization;
  return typeof value === 'string' && /^Bearer\s+\S+$/i.test(value) ? value : null;
}

function validUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body';
  if (typeof body.prompt !== 'string') return 'prompt';
  const prompt = body.prompt.trim();
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return 'prompt';
  if (body.module !== undefined && body.module !== 'battery') return 'module';
  if (body.request_id !== undefined && !validUuid(body.request_id)) return 'request_id';
  const allowed = new Set(['prompt', 'module', 'request_id']);
  if (Object.keys(body).some(key => !allowed.has(key))) return 'unknown_field';
  return null;
}

function authFailure(status, code, message) {
  const error = new Error(code);
  error.status = status;
  error.publicCode = code;
  error.publicMessage = message;
  return error;
}

async function validateAccessToken(authorization, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = AUTH_TIMEOUT_MS) {
  const { base, key } = getSupabaseConfig(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${base.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: authorization,
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw authFailure(503, 'AUTH_SERVICE_TIMEOUT', 'Authentication service timed out.');
    }
    throw authFailure(503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw authFailure(401, 'AUTH_INVALID', 'Authentication is invalid or expired.');
  }
  if (!response.ok) {
    throw authFailure(503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable.');
  }

  let user;
  try {
    user = await response.json();
  } catch {
    throw authFailure(502, 'AUTH_RESPONSE_INVALID', 'Authentication response is invalid.');
  }
  if (!user || !validUuid(user.id)) {
    throw authFailure(502, 'AUTH_RESPONSE_INVALID', 'Authentication response is invalid.');
  }
  return { id: user.id };
}

function publicError(error) {
  if (error instanceof AIExtractorError || error instanceof AIPersistenceError) {
    return {
      status: Number.isInteger(error.status) ? error.status : 502,
      body: { error: { code: error.code || 'AI_ERROR', message: error.message || 'AI request failed.' } }
    };
  }
  if (Number.isInteger(error?.status) && error?.publicCode) {
    return {
      status: error.status,
      body: { error: { code: error.publicCode, message: error.publicMessage || 'The request failed.' } }
    };
  }
  return {
    status: 502,
    body: { error: { code: 'UPSTREAM_ERROR', message: 'The request failed.' } }
  };
}

function createHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function aiIntakeHandler(req, res) {
    startRequestObservability(req, res, 'ai-intake');

    const local = enforceRateLimit(req, res, 'ai-intake');
    if (!local.allowed) return send(res, 429, rateLimitBody());

    const authorization = bearer(req);
    if (!authorization) {
      return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
    }

    const shared = await enforceSharedRateLimit(
      req,
      res,
      'ai-intake',
      authorization,
      { env, fetchImpl }
    );
    if (shared.error) return send(res, 503, sharedRateLimitUnavailableBody());
    if (!shared.allowed) return send(res, 429, rateLimitBody());

    if (String(req.method || 'GET').toUpperCase() !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Unsupported method.' } });
    }

    let body;
    try {
      body = parseBody(req);
    } catch (error) {
      const response = bodyErrorResponse(error);
      return send(res, response.status, response.body);
    }

    if (validateBody(body)) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
    }

    const prompt = body.prompt.trim();
    try {
      await validateAccessToken(authorization, env, fetchImpl);
      const extracted = await extractPromptCandidates({
        prompt,
        env,
        fetchImpl,
        sourceRef: 'conversation:prompt'
      });
      const state = buildIntakeState({
        module: body.module || 'battery',
        mode: 'ai',
        prompt,
        facts: extracted.facts
      });
      const persistence = await persistExtractedTurn({
        authorization,
        prompt,
        candidates: extracted.candidates,
        model: extracted.model,
        sourceRef: 'conversation:prompt',
        requestId: body.request_id,
        env,
        fetchImpl
      });
      return send(res, 200, {
        data: {
          candidates: extracted.candidates,
          intake: state,
          model: extracted.model,
          persistence,
          notice: 'AI candidates are unverified until explicitly confirmed by the user.'
        }
      });
    } catch (error) {
      const response = publicError(error);
      return send(res, response.status, response.body);
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports._test = {
  AUTH_TIMEOUT_MS,
  bearer,
  validUuid,
  validateBody,
  validateAccessToken,
  publicError,
  createHandler
};
