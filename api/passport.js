'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const { sanitizePublicPayload, findRestrictedPublicPaths } = require('./_access_policy.js');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function bearer(req) {
  const value = req.headers && (req.headers.authorization || req.headers.Authorization);
  return typeof value === 'string' && /^Bearer\s+\S+$/i.test(value) ? value : null;
}


function validUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validTimestamp(value) {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function validObject(value) {
  return value == null || (!Array.isArray(value) && typeof value === 'object');
}

function validatePublicPayloadAccess(value) {
  const restricted = findRestrictedPublicPaths(value);
  if (restricted.length === 0) return null;
  return 'public_payload contains fields that are not public';
}

function sanitizePublicPassport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const allowed = ['passport_id','unique_identifier','status','public_payload','updated_at'];
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = key === 'public_payload' ? sanitizePublicPayload(value[key]) : value[key];
  }
  return out;
}

function mapDatabaseError(data) {
  const mapped = mapSharedDatabaseError('passport', data);
  return [mapped.status, mapped.code, mapped.message];
}

async function rpc(name, payload, authorization, env = process.env, fetchImpl = fetch) {
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!base || !key) {
    const error = new Error('SERVER_CONFIGURATION_MISSING');
    error.status = 500;
    throw error;
  }

  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (authorization) headers.Authorization = authorization;

  const response = await fetchImpl(`${base.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });

  let data = null;
  try { data = await response.json(); } catch (_) { data = null; }

  if (!response.ok) {
    const [status, publicCode, publicMessage] = mapDatabaseError(data);
    const error = new Error(publicCode);
    error.status = status;
    error.publicCode = publicCode;
    error.publicMessage = publicMessage;
    throw error;
  }
  return data;
}

async function handler(req, res) {
  startRequestObservability(req,res,'passport');
  const rateLimit=enforceRateLimit(req,res,'passport');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());
  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH'].includes(method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return send(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Unsupported method.' } });
  }

  let body = {};
  try { body = parseBody(req); }
  catch (error) {
    const response = bodyErrorResponse(error);
    return send(res, response.status, response.body);
  }

  try {
    if (method === 'GET') {
      const identifier = req.query && req.query.identifier;
      const id = req.query && req.query.id;

      if (identifier) {
        if (typeof identifier !== 'string' || identifier.trim().length < 1 || identifier.trim().length > 300) {
          return send(res, 400, { error: { code: 'INVALID_IDENTIFIER', message: 'identifier must contain 1..300 characters' } });
        }
        const passport = await rpc('dpp_api_passport_public', { p_unique_identifier: identifier.trim() }, null);
        return send(res, 200, { data: sanitizePublicPassport(passport) });
      }

      if (!validUuid(id)) {
        return send(res, 400, { error: { code: 'INVALID_PASSPORT_ID', message: 'A valid passport UUID is required.' } });
      }

      const authorization = bearer(req);
      if (!authorization) {
        return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
      }
      const passport = await rpc('dpp_api_passport_private', { p_id: id }, authorization);
      return send(res, 200, { data: passport });
    }

    const authorization = bearer(req);
    if (!authorization) {
      return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
    }

    if (method === 'POST') {
      if (!validUuid(body.battery_item_id)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'battery_item_id must be a valid UUID' } });
      }
      if (!validObject(body.public_payload)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'public_payload must be a JSON object' } });
      }
      const publicAccessProblem = validatePublicPayloadAccess(body.public_payload);
      if (publicAccessProblem) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: publicAccessProblem } });
      }
      if (!validObject(body.private_payload)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'private_payload must be a JSON object' } });
      }

      const passport = await rpc('dpp_api_passport_create', {
        p_battery_item_id: body.battery_item_id,
        p_public_payload: body.public_payload || {},
        p_private_payload: body.private_payload || {}
      }, authorization);
      return send(res, 201, { data: passport });
    }

    const id = body.id || (req.query && req.query.id);
    if (!validUuid(id)) {
      return send(res, 400, { error: { code: 'INVALID_PASSPORT_ID', message: 'A valid passport UUID is required.' } });
    }
    if (!validTimestamp(body.expected_updated_at)) {
      return send(res, 428, { error: { code: 'WRITE_PRECONDITION_REQUIRED', message: 'expected_updated_at must be a valid timestamp from the last read.' } });
    }
    if (body.status != null && !['draft','active','suspended','retired'].includes(body.status)) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'unsupported passport status' } });
    }
    if (!validObject(body.public_payload)) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'public_payload must be a JSON object' } });
    }
    const publicAccessProblem = validatePublicPayloadAccess(body.public_payload);
    if (publicAccessProblem) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: publicAccessProblem } });
    }
    if (!validObject(body.private_payload)) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'private_payload must be a JSON object' } });
    }

    const passport = await rpc('dpp_api_passport_update_checked', {
      p_id: id,
      p_status: body.status == null ? null : body.status,
      p_public_payload: body.public_payload == null ? null : body.public_payload,
      p_private_payload: body.private_payload == null ? null : body.private_payload,
      p_expected_updated_at: body.expected_updated_at
    }, authorization);
    return send(res, 200, { data: passport });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    const code = error.publicCode || error.message || 'UPSTREAM_ERROR';
    const message = error.publicMessage || (status === 500
      ? 'Server configuration is incomplete.'
      : status >= 500
        ? 'Database request failed.'
        : code.replace(/_/g, ' ').toLowerCase());
    return send(res, status, { error: { code, message } });
  }
}

module.exports = handler;
module.exports._test = { bearer, parseBody, validUuid, validTimestamp, validObject, validatePublicPayloadAccess, sanitizePublicPassport, mapDatabaseError, rpc };
