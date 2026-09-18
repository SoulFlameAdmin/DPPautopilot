'use strict';

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

function parseBody(req) {
  if (req.body == null || req.body === '') return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string' || Buffer.byteLength(req.body, 'utf8') > 1024 * 1024) {
    throw new Error('INVALID_BODY');
  }
  return JSON.parse(req.body);
}

function validUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  const code = data && data.code;
  if (code === 'DP101') return [401, 'AUTH_REQUIRED'];
  if (code === 'DP102' || code === 'DP103' || code === 'DP104') return [403, 'FORBIDDEN'];
  if (code === 'DP201' || code === 'DP202' || code === 'DP203' || code === 'DP204') return [422, 'VALIDATION_ERROR'];
  if (code === 'DP205') return [404, 'MODEL_NOT_FOUND'];
  if (code === '23505') return [409, 'MODEL_CONFLICT'];
  return [502, 'UPSTREAM_ERROR'];
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
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const [status, publicCode] = mapDatabaseError(data);
    const error = new Error(publicCode);
    error.status = status;
    error.publicCode = publicCode;
    throw error;
  }
  return data;
}

async function handler(req, res) {
  const authorization = bearer(req);
  if (!authorization) return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });

  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return send(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Unsupported method.' } });
  }

  let body = {};
  try {
    body = parseBody(req);
  } catch (_) {
    return send(res, 400, { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
  }

  try {
    if (method === 'GET') {
      const models = await rpc('dpp_api_models_list', {}, authorization);
      return send(res, 200, { data: models });
    }

    if (method === 'POST') {
      const problem = validateCreate(body);
      if (problem) return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: problem } });
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
      if (body.model_identifier != null && (typeof body.model_identifier !== 'string' || body.model_identifier.trim().length < 1 || body.model_identifier.trim().length > 128)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'model_identifier must contain 1..128 characters' } });
      }
      if (body.manufacturer_name != null && (typeof body.manufacturer_name !== 'string' || body.manufacturer_name.trim().length < 1 || body.manufacturer_name.trim().length > 250)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'manufacturer_name must contain 1..250 characters' } });
      }
      if (body.category != null && !CATEGORIES.has(body.category)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'unsupported battery category' } });
      }
      if (body.canonical_data != null && (Array.isArray(body.canonical_data) || typeof body.canonical_data !== 'object')) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'canonical_data must be a JSON object' } });
      }

      const model = await rpc('dpp_api_models_update', {
        p_id: id,
        p_model_identifier: body.model_identifier == null ? null : body.model_identifier.trim(),
        p_manufacturer_name: body.manufacturer_name == null ? null : body.manufacturer_name.trim(),
        p_category: body.category == null ? null : body.category,
        p_canonical_data: body.canonical_data == null ? null : body.canonical_data
      }, authorization);
      return send(res, 200, { data: model });
    }

    const deleted = await rpc('dpp_api_models_delete', { p_id: id }, authorization);
    return send(res, 200, { data: { id: deleted, deleted: true } });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    const code = error.publicCode || error.message || 'UPSTREAM_ERROR';
    const message = status === 500
      ? 'Server configuration is incomplete.'
      : status >= 500
        ? 'Database request failed.'
        : code.replace(/_/g, ' ').toLowerCase();
    return send(res, status, { error: { code, message } });
  }
}

module.exports = handler;
module.exports._test = { bearer, parseBody, validUuid, validateCreate, mapDatabaseError, rpc };
