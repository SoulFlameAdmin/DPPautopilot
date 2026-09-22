'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const CATEGORIES = new Set([
  'portable',
  'light_means_of_transport',
  'starting_lighting_ignition',
  'industrial',
  'electric_vehicle',
  'other'
]);

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

function validateCreate(body) {
  if (typeof body.model_identifier !== 'string' || body.model_identifier.trim().length < 1 || body.model_identifier.trim().length > 128) {
    return 'model_identifier must contain 1..128 characters';
  }
  if (typeof body.manufacturer_name !== 'string' || body.manufacturer_name.trim().length < 1 || body.manufacturer_name.trim().length > 250) {
    return 'manufacturer_name must contain 1..250 characters';
  }
  if (!CATEGORIES.has(body.category)) return 'unsupported battery category';
  if (body.canonical_data != null && (Array.isArray(body.canonical_data) || typeof body.canonical_data !== 'object')) {
    return 'canonical_data must be a JSON object';
  }
  return null;
}

function mapDatabaseError(data) {
  const mapped = mapSharedDatabaseError('models', data);
  return [mapped.status, mapped.code, mapped.message];
}

const DEFAULT_RPC_TIMEOUT_MS = 8000;

function upstreamTimeoutError() {
  const error = new Error('UPSTREAM_TIMEOUT');
  error.status = 504;
  error.publicCode = 'UPSTREAM_TIMEOUT';
  error.publicMessage = 'Database request timed out.';
  return error;
}

function upstreamInvalidJsonError() {
  const error = new Error('UPSTREAM_ERROR');
  error.status = 502;
  error.publicCode = 'UPSTREAM_ERROR';
  error.publicMessage = 'Database request failed.';
  return error;
}

async function rpc(name, payload, authorization, env = process.env, fetchImpl = fetch, timeoutMs = DEFAULT_RPC_TIMEOUT_MS) {
  const base = env.DPP_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.DPP_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!base || !key) {
    const error = new Error('SERVER_CONFIGURATION_MISSING');
    error.status = 500;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let data = null;
  try {
    response = await fetchImpl(`${base.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: authorization,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload || {}));
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted || (error && error.name === 'AbortError')) throw upstreamTimeoutError();
      if (response.ok) throw upstreamInvalidJsonError();
      data = null;
    }
  } catch (error) {
    if (controller.signal.aborted || (error && error.name === 'AbortError')) throw upstreamTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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
  startRequestObservability(req,res,'models');
  const rateLimit=enforceRateLimit(req,res,'models');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());
  const authorization = bearer(req);
  if (!authorization) return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
  const sharedRateLimit=await enforceSharedRateLimit(req,res,'models',authorization);
  if(sharedRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!sharedRateLimit.allowed) return send(res,429,rateLimitBody());


  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return send(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Unsupported method.' } });
  }

  let body = {};
  try {
    body = parseBody(req);
  } catch (error) {
    const response = bodyErrorResponse(error);
    return send(res, response.status, response.body);
  }

  try {
    if (method === 'GET') {
      const models = await rpc('dpp_api_models_list', {}, authorization);
      return send(res, 200, { data: models });
    }

    if (method === 'POST') {
      const problem = validateCreate(body);
      if (problem) return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      const model = await rpc('dpp_api_models_create', {
        p_model_identifier: body.model_identifier.trim(),
        p_manufacturer_name: body.manufacturer_name.trim(),
        p_category: body.category,
        p_canonical_data: body.canonical_data || {}
      }, authorization);
      return send(res, 201, { data: model });
    }

    const id = body.id || (req.query && req.query.id);
    if (!validUuid(id)) return send(res, 400, { error: { code: 'INVALID_MODEL_ID', message: 'A valid model UUID is required.' } });

    if (method === 'PATCH') {
      if (!validTimestamp(body.expected_updated_at)) {
        return send(res, 428, { error: { code: 'WRITE_PRECONDITION_REQUIRED', message: 'expected_updated_at must be a valid timestamp from the last read.' } });
      }
      if (body.model_identifier != null && (typeof body.model_identifier !== 'string' || body.model_identifier.trim().length < 1 || body.model_identifier.trim().length > 128)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      if (body.manufacturer_name != null && (typeof body.manufacturer_name !== 'string' || body.manufacturer_name.trim().length < 1 || body.manufacturer_name.trim().length > 250)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      if (body.category != null && !CATEGORIES.has(body.category)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      if (body.canonical_data != null && (Array.isArray(body.canonical_data) || typeof body.canonical_data !== 'object')) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }

      const model = await rpc('dpp_api_models_update_checked', {
        p_id: id,
        p_model_identifier: body.model_identifier == null ? null : body.model_identifier.trim(),
        p_manufacturer_name: body.manufacturer_name == null ? null : body.manufacturer_name.trim(),
        p_category: body.category == null ? null : body.category,
        p_canonical_data: body.canonical_data == null ? null : body.canonical_data,
        p_expected_updated_at: body.expected_updated_at
      }, authorization);
      return send(res, 200, { data: model });
    }

    if (!validTimestamp(body.expected_updated_at)) {
      return send(res, 428, { error: { code: 'WRITE_PRECONDITION_REQUIRED', message: 'expected_updated_at must be a valid timestamp from the last read.' } });
    }
    const deleted = await rpc('dpp_api_models_delete_checked', {
      p_id: id,
      p_expected_updated_at: body.expected_updated_at
    }, authorization);
    return send(res, 200, { data: { id: deleted, deleted: true } });
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
module.exports._test = { bearer, parseBody, validUuid, validTimestamp, validateCreate, mapDatabaseError, rpc, DEFAULT_RPC_TIMEOUT_MS };
