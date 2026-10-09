'use strict';

const { parseBody, bodyErrorResponse } = require('./_request.js');
const {
  enforceRateLimit,
  enforceSharedRateLimit,
  sharedRateLimitUnavailableBody,
  rateLimitBody
} = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const {
  AIPersistenceError,
  ONBOARDING_KEYS,
  persistenceEnabled,
  resumeOrCreate,
  snapshot,
  reviewCandidate
} = require('./_ai_intake_persistence.js');

const ONBOARDING_KEY_SET = new Set(ONBOARDING_KEYS);

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

function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body';
  if (!['resume','snapshot','review'].includes(body.action)) return 'action';

  if (body.action === 'resume') {
    return Object.keys(body).some(key => key !== 'action') ? 'unknown_field' : null;
  }

  if (typeof body.session_id !== 'string') return 'session_id';
  if (body.action === 'snapshot') {
    const allowed = new Set(['action','session_id']);
    return Object.keys(body).some(key => !allowed.has(key)) ? 'unknown_field' : null;
  }

  const allowed = new Set(['action','session_id','field_key','approved_value','accept']);
  if (Object.keys(body).some(key => !allowed.has(key))) return 'unknown_field';
  if (!ONBOARDING_KEY_SET.has(body.field_key)) return 'field_key';
  if (typeof body.accept !== 'boolean') return 'accept';
  if (body.accept) {
    if (typeof body.approved_value !== 'string') return 'approved_value';
    const value = body.approved_value.trim();
    if (!value || value.length > 5000) return 'approved_value';
  } else if (body.approved_value !== undefined && body.approved_value !== null) {
    return 'approved_value';
  }
  return null;
}

function publicError(error) {
  if (error instanceof AIPersistenceError) {
    return {
      status: Number.isInteger(error.status) ? error.status : 502,
      body: { error: { code: error.code || 'AI_PERSISTENCE_ERROR', message: error.message || 'AI intake state request failed.' } }
    };
  }
  return {
    status: 502,
    body: { error: { code: 'UPSTREAM_ERROR', message: 'The request failed.' } }
  };
}

function createHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function aiIntakeStateHandler(req, res) {
    startRequestObservability(req, res, 'ai-intake-state');

    const local = enforceRateLimit(req, res, 'ai-intake-state');
    if (!local.allowed) return send(res, 429, rateLimitBody());

    const authorization = bearer(req);
    if (!authorization) {
      return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
    }

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

    if (!persistenceEnabled(env)) {
      return send(res, 503, {
        error: {
          code: 'AI_PERSISTENCE_NOT_ENABLED',
          message: 'AI intake persistence is not enabled.'
        }
      });
    }

    const shared = await enforceSharedRateLimit(
      req,
      res,
      'ai-intake-state',
      authorization,
      { env, fetchImpl }
    );
    if (shared.error) return send(res, 503, sharedRateLimitUnavailableBody());
    if (!shared.allowed) return send(res, 429, rateLimitBody());

    try {
      const options = { authorization, env, fetchImpl };
      let data;
      if (body.action === 'resume') {
        data = await resumeOrCreate(options);
      } else if (body.action === 'snapshot') {
        data = await snapshot(body.session_id, options);
      } else {
        data = await reviewCandidate({
          sessionId: body.session_id,
          fieldKey: body.field_key,
          approvedValue: body.approved_value,
          accept: body.accept
        }, options);
      }
      return send(res, 200, { data });
    } catch (error) {
      const response = publicError(error);
      return send(res, response.status, response.body);
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports._test = {
  bearer,
  validateBody,
  publicError,
  createHandler
};
