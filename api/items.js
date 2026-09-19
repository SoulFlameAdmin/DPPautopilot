'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, rateLimitBody } = require('./_rate_limit.js');

const LIFECYCLE = new Set([
  'original','repurposed','remanufactured','second_life','waste','retired'
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

function validateCanonicalData(value) {
  return value == null || (!Array.isArray(value) && typeof value === 'object');
}

function validateCreate(body) {
  if (!validUuid(body.model_id)) return 'a valid model_id UUID is required';
  if (typeof body.unique_identifier !== 'string' || body.unique_identifier.trim().length < 1 || body.unique_identifier.trim().length > 300) {
    return 'unique_identifier must contain 1..300 characters';
  }
  if (body.lifecycle_status != null && !LIFECYCLE.has(body.lifecycle_status)) {
    return 'unsupported lifecycle status';
  }
  if (!validateCanonicalData(body.canonical_data)) return 'canonical_data must be a JSON object';
  return null;
}

function mapDatabaseError(data) {
  const mapped = mapSharedDatabaseError('items', data);
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

  const response = await fetchImpl(`${base.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: authorization,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
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
  const rateLimit=enforceRateLimit(req,res,'items');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());
  const authorization = bearer(req);
  if (!authorization) return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });

  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET','POST','PATCH','DELETE'].includes(method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
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
      const items = await rpc('dpp_api_items_list', {}, authorization);
      return send(res, 200, { data: items });
    }

    if (method === 'POST') {
      const problem = validateCreate(body);
      if (problem) return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: problem } });
      const item = await rpc('dpp_api_items_create', {
        p_model_id: body.model_id,
        p_unique_identifier: body.unique_identifier.trim(),
        p_lifecycle_status: body.lifecycle_status || 'original',
        p_canonical_data: body.canonical_data || {}
      }, authorization);
      return send(res, 201, { data: item });
    }

    const id = body.id || (req.query && req.query.id);
    if (!validUuid(id)) return send(res, 400, { error: { code: 'INVALID_ITEM_ID', message: 'A valid item UUID is required.' } });

    if (method === 'PATCH') {
      if (body.model_id != null && !validUuid(body.model_id)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'model_id must be a valid UUID' } });
      }
      if (body.unique_identifier != null &&
          (typeof body.unique_identifier !== 'string' || body.unique_identifier.trim().length < 1 || body.unique_identifier.trim().length > 300)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'unique_identifier must contain 1..300 characters' } });
      }
      if (body.lifecycle_status != null && !LIFECYCLE.has(body.lifecycle_status)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'unsupported lifecycle status' } });
      }
      if (!validateCanonicalData(body.canonical_data)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'canonical_data must be a JSON object' } });
      }

      const item = await rpc('dpp_api_items_update', {
        p_id: id,
        p_model_id: body.model_id == null ? null : body.model_id,
        p_unique_identifier: body.unique_identifier == null ? null : body.unique_identifier.trim(),
        p_lifecycle_status: body.lifecycle_status == null ? null : body.lifecycle_status,
        p_canonical_data: body.canonical_data == null ? null : body.canonical_data
      }, authorization);
      return send(res, 200, { data: item });
    }

    const deleted = await rpc('dpp_api_items_delete', { p_id: id }, authorization);
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
module.exports._test = { bearer, parseBody, validUuid, validateCreate, validateCanonicalData, mapDatabaseError, rpc };
