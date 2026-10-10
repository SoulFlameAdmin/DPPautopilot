'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const { sanitizePublicPayload, sanitizeOrganizationPrivatePayload, findRestrictedPublicPaths, findAuthorityOnlyPaths } = require('./_access_policy.js');
const PUBLIC = require('./_public_config.js');

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

const PASSPORT_STATUSES = new Set(['draft','active','suspended','retired','revoked','replaced']);
const DIRECT_UPDATE_STATUSES = new Set(['draft','active','suspended']);
const TERMINAL_PASSPORT_STATUSES = new Set(['retired','revoked','replaced']);
const LIFECYCLE_REASONS = new Set([
  'end_of_life','operator_revoked','safety_or_compliance',
  'incorrect_record','product_replaced','other'
]);

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validPublicPassport(value) {
  return plainObject(value) &&
    validUuid(value.passport_id) &&
    validUuid(value.battery_item_id) &&
    typeof value.unique_identifier === 'string' &&
    value.unique_identifier.trim().length >= 1 &&
    value.unique_identifier.trim().length <= 300 &&
    value.status === 'active' &&
    plainObject(value.public_payload) &&
    validTimestamp(value.updated_at);
}

function validPublicResolve(value) {
  if (!plainObject(value) ||
      !validUuid(value.passport_id) ||
      typeof value.unique_identifier !== 'string' ||
      value.unique_identifier.trim().length < 1 ||
      value.unique_identifier.trim().length > 300 ||
      !validTimestamp(value.updated_at)) return false;

  if (value.kind === 'active') {
    return value.status === 'active' &&
      validUuid(value.battery_item_id) &&
      plainObject(value.public_payload);
  }

  if (value.kind === 'lifecycle') {
    if (!TERMINAL_PASSPORT_STATUSES.has(value.status) ||
        !LIFECYCLE_REASONS.has(value.reason_code) ||
        !validTimestamp(value.changed_at)) return false;
    if (value.status === 'replaced') {
      return typeof value.replacement_identifier === 'string' &&
        value.replacement_identifier.trim().length >= 1 &&
        value.replacement_identifier.trim().length <= 300;
    }
    return value.replacement_identifier == null;
  }

  return false;
}

function validTechnicalPilotPassport(value) {
  return plainObject(value) &&
    validUuid(value.passport_id) &&
    validUuid(value.battery_item_id) &&
    validUuid(value.model_id) &&
    typeof value.unique_identifier === 'string' &&
    value.unique_identifier.trim().length >= 1 &&
    value.unique_identifier.trim().length <= 300 &&
    value.status === 'active' &&
    plainObject(value.public_payload) &&
    plainObject(value.private_payload) &&
    value.public_payload?.pilot?.mode === 'technical_pilot' &&
    value.public_payload?.pilot?.regulatory_compliance === false &&
    value.technical_pilot === true &&
    value.regulatory_compliance === false &&
    typeof value.created === 'boolean' &&
    typeof value.idempotent_replay === 'boolean' &&
    validTimestamp(value.created_at) &&
    validTimestamp(value.updated_at);
}

function validPrivatePassport(value) {
  return plainObject(value) &&
    validUuid(value.passport_id) &&
    validUuid(value.battery_item_id) &&
    PASSPORT_STATUSES.has(value.status) &&
    plainObject(value.public_payload) &&
    plainObject(value.private_payload) &&
    validTimestamp(value.created_at) &&
    validTimestamp(value.updated_at);
}

function validReadinessReport(value) {
  return plainObject(value) &&
    validUuid(value.passport_id) &&
    validUuid(value.battery_item_id) &&
    validUuid(value.model_id) &&
    typeof value.unique_identifier === 'string' &&
    PASSPORT_STATUSES.has(value.status) &&
    typeof value.schema_version === 'string' &&
    Array.isArray(value.missing_points) &&
    value.missing_points.every(Number.isInteger) &&
    Array.isArray(value.undecided_conditional_points) &&
    value.undecided_conditional_points.every(Number.isInteger) &&
    Number.isInteger(value.missing_count) &&
    Number.isInteger(value.undecided_count) &&
    typeof value.ready === 'boolean';
}

function validCompletenessReport(value) {
  return validReadinessReport(value) &&
    validTimestamp(value.passport_updated_at) &&
    Number.isInteger(value.required_point_count) &&
    value.required_point_count >= 50 &&
    Number.isInteger(value.complete_point_count) &&
    value.complete_point_count >= 0 &&
    value.complete_point_count <= value.required_point_count &&
    Number.isInteger(value.blocking_count) &&
    value.blocking_count === value.missing_count + value.undecided_count &&
    typeof value.workflow_score_percent === 'number' &&
    Number.isFinite(value.workflow_score_percent) &&
    value.workflow_score_percent >= 0 &&
    value.workflow_score_percent <= 100;
}

function validAuthorityEvidenceReceipt(value) {
  return plainObject(value) &&
    validUuid(value.passport_id) &&
    validUuid(value.model_id) &&
    value.field_number === 50 &&
    value.accepted === true &&
    validTimestamp(value.updated_at);
}

function validateRpcShape(name, data) {
  if (name === 'dpp_api_passport_public') return validPublicPassport(data);
  if (name === 'dpp_api_passport_public_resolve') return validPublicResolve(data);
  if (name === 'dpp_api_scooter_passport_readiness') return validReadinessReport(data);
  if (name === 'dpp_api_scooter_completeness_by_identifier') return validCompletenessReport(data);
  if (name === 'dpp_api_scooter_authority_evidence_submit') return validAuthorityEvidenceReceipt(data);
  if (name === 'dpp_api_technical_pilot_publish') return validTechnicalPilotPassport(data);
  if (name === 'dpp_api_passport_private' ||
      name === 'dpp_api_passport_create' ||
      name === 'dpp_api_passport_update_checked' ||
      name === 'dpp_api_technical_pilot_update_capacity' ||
      name === 'dpp_api_scooter_passport_activate' ||
      name === 'dpp_api_scooter_passport_transition') return validPrivatePassport(data);
  return true;
}

function validatePublicPayloadAccess(value) {
  const restricted = findRestrictedPublicPaths(value);
  if (restricted.length === 0) return null;
  return 'public_payload contains fields that are not public';
}

function validateOrganizationPrivatePayloadAccess(value) {
  const authorityOnly = findAuthorityOnlyPaths(value);
  if (authorityOnly.length === 0) return null;
  return 'private_payload contains authority-only fields';
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

function sanitizePublicResolve(value) {
  if (!plainObject(value)) return value;
  if (value.kind === 'active') {
    return {
      kind: 'active',
      ...sanitizePublicPassport(value)
    };
  }
  const allowed = [
    'kind','passport_id','unique_identifier','status','reason_code',
    'replacement_identifier','updated_at','changed_at'
  ];
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(value,key)) out[key]=value[key];
  }
  return out;
}

function mapDatabaseError(data) {
  const mapped = mapSharedDatabaseError('passport', data);
  return [mapped.status, mapped.code, mapped.message];
}

function sanitizeOrganizationPrivatePassport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = { ...value };
  if (Object.prototype.hasOwnProperty.call(value, 'private_payload')) {
    out.private_payload = sanitizeOrganizationPrivatePayload(value.private_payload);
  }
  return out;
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
  const base = env.DPP_SUPABASE_URL || env.SUPABASE_URL || PUBLIC.supabaseUrl;
  const key = env.DPP_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || PUBLIC.supabasePublishableKey;
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let data = null;
  try {
    response = await fetchImpl(`${base.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {}),
    signal: controller.signal
  });
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted || (error && error.name === 'AbortError')) throw upstreamTimeoutError();
      if (response.ok) throw upstreamInvalidJsonError();
      data = null;
    }
  } catch (error) {
    if (controller.signal.aborted || (error && error.name === 'AbortError')) throw upstreamTimeoutError();
    if (error && error.publicCode) throw error;
    throw upstreamInvalidJsonError();
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
  if (!validateRpcShape(name, data)) throw upstreamInvalidJsonError();
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
      const readiness = req.query && req.query.readiness;
      const carrier = req.query && req.query.carrier;
      const list = req.query && req.query.list;

      if (list === '1' || list === 'true') {
        const authorization = bearer(req);
        if (!authorization) {
          return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
        }
        const limit = Number(req.query && req.query.limit || 250);
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
          return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
        }
        const sharedListRateLimit=await enforceSharedRateLimit(req,res,'passport',authorization,{ruleName:'authenticated_read'});
        if(sharedListRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
        if(!sharedListRateLimit.allowed) return send(res,429,rateLimitBody());
        const rows = await rpc('dpp_api_passports_list', { p_limit: limit }, authorization);
        return send(res, 200, { data: Array.isArray(rows) ? rows : [] });
      }

      if (identifier) {
        if (typeof identifier !== 'string' || identifier.trim().length < 1 || identifier.trim().length > 300) {
          return send(res, 400, { error: { code: 'INVALID_IDENTIFIER', message: 'identifier must contain 1..300 characters.' } });
        }
        if (readiness === '1' || readiness === 'true') {
          const authorization = bearer(req);
          if (!authorization) {
            return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
          }
          const sharedReadinessRateLimit=await enforceSharedRateLimit(req,res,'passport',authorization,{ruleName:'authenticated_read'});
          if(sharedReadinessRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
          if(!sharedReadinessRateLimit.allowed) return send(res,429,rateLimitBody());
          const report = await rpc('dpp_api_scooter_completeness_by_identifier', {
            p_unique_identifier: identifier.trim()
          }, authorization);
          return send(res, 200, { data: report });
        }
        if (carrier != null && carrier !== '') {
          if (!['qr','nfc'].includes(String(carrier))) {
            return send(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
          }
          const scanned = await rpc('dpp_api_carrier_open', {
            p_unique_identifier: identifier.trim(),
            p_source: String(carrier)
          }, null);
          return send(res, 200, { data: sanitizePublicResolve({ kind: 'active', ...scanned }) });
        }
        const passport = await rpc('dpp_api_passport_public_resolve', { p_unique_identifier: identifier.trim() }, null);
        return send(res, 200, { data: sanitizePublicResolve(passport) });
      }

      if (!validUuid(id)) {
        return send(res, 400, { error: { code: 'INVALID_PASSPORT_ID', message: 'A valid passport UUID is required.' } });
      }

      const authorization = bearer(req);
      if (!authorization) {
        return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
      }
      const sharedPrivateRateLimit=await enforceSharedRateLimit(req,res,'passport',authorization,{ruleName:'authenticated_read'});
      if(sharedPrivateRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
      if(!sharedPrivateRateLimit.allowed) return send(res,429,rateLimitBody());
      if (readiness === '1' || readiness === 'true') {
        const report = await rpc('dpp_api_scooter_passport_readiness', { p_passport_id: id }, authorization);
        return send(res, 200, { data: report });
      }
      const passport = await rpc('dpp_api_passport_private', { p_id: id }, authorization);
      return send(res, 200, { data: sanitizeOrganizationPrivatePassport(passport) });
    }

    const authorization = bearer(req);
    if (!authorization) {
      return send(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Bearer authentication is required.' } });
    }

    const sharedWriteRateLimit=await enforceSharedRateLimit(req,res,'passport',authorization,{ruleName:'authenticated_write'});
    if(sharedWriteRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
    if(!sharedWriteRateLimit.allowed) return send(res,429,rateLimitBody());

    if (method === 'POST') {
      if (!validUuid(body.battery_item_id)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      if (!validObject(body.public_payload)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      const publicAccessProblem = validatePublicPayloadAccess(body.public_payload);
      if (publicAccessProblem) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      if (!validObject(body.private_payload)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      const privateAccessProblem = validateOrganizationPrivatePayloadAccess(body.private_payload);
      if (privateAccessProblem) {
        return send(res, 403, { error: { code: 'FORBIDDEN', message: 'Authority-only fields are not available to organization users.' } });
      }

      if (body.action != null && !['publish_technical_pilot'].includes(body.action)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }

      if (body.action === 'publish_technical_pilot') {
        if (!plainObject(body.public_payload?.item) ||
            typeof body.public_payload.item.unique_identifier !== 'string' ||
            !body.public_payload.item.unique_identifier.trim()) {
          return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
        }
        const passport = await rpc('dpp_api_technical_pilot_publish', {
          p_battery_item_id: body.battery_item_id,
          p_public_payload: body.public_payload || {},
          p_private_payload: body.private_payload || {}
        }, authorization);
        return send(res, passport.idempotent_replay ? 200 : 201, {
          data: sanitizeOrganizationPrivatePassport(passport)
        });
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
    if (body.action != null && !['activate','submit_authority_evidence','transition','update_technical_pilot'].includes(body.action)) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
    }
    if (body.action === 'submit_authority_evidence') {
      if (body.field_number !== 50 || !plainObject(body.evidence) || Object.keys(body.evidence).length === 0) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      const receipt = await rpc('dpp_api_scooter_authority_evidence_submit', {
        p_passport_id: id,
        p_field_number: body.field_number,
        p_evidence: body.evidence
      }, authorization);
      return send(res, 200, { data: receipt });
    }
    if (body.action === 'update_technical_pilot') {
      const capacityAh = Number(body.capacity_ah);
      if (!Number.isFinite(capacityAh) || capacityAh <= 0 || capacityAh > 100000) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }

      const passport = await rpc('dpp_api_technical_pilot_update_capacity', {
        p_id: id,
        p_capacity_ah: capacityAh,
        p_expected_updated_at: body.expected_updated_at
      }, authorization);

      return send(res, 200, { data: sanitizeOrganizationPrivatePassport(passport) });
    }

    if (body.action === 'activate') {
      const passport = await rpc('dpp_api_scooter_passport_activate', {
        p_passport_id: id,
        p_expected_updated_at: body.expected_updated_at
      }, authorization);
      return send(res, 200, { data: sanitizeOrganizationPrivatePassport(passport) });
    }
    if (body.action === 'transition') {
      const transition = typeof body.transition === 'string' ? body.transition.trim() : '';
      const reasonCode = typeof body.reason_code === 'string' ? body.reason_code.trim() : '';
      const reasonNote = body.reason_note == null ? null : String(body.reason_note).trim();
      const replacementIdentifier = body.replacement_identifier == null ? null : String(body.replacement_identifier).trim();

      if (!TERMINAL_PASSPORT_STATUSES.has(transition) ||
          !LIFECYCLE_REASONS.has(reasonCode) ||
          (reasonNote != null && reasonNote.length > 500)) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }
      if (transition === 'replaced') {
        if (reasonCode !== 'product_replaced' ||
            !replacementIdentifier ||
            replacementIdentifier.length > 300) {
          return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
        }
      } else if (replacementIdentifier) {
        return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
      }

      const passport = await rpc('dpp_api_scooter_passport_transition', {
        p_passport_id: id,
        p_transition: transition,
        p_reason_code: reasonCode,
        p_reason_note: reasonNote || null,
        p_replacement_identifier: transition === 'replaced' ? replacementIdentifier : null,
        p_expected_updated_at: body.expected_updated_at
      }, authorization);
      return send(res, 200, { data: sanitizeOrganizationPrivatePassport(passport) });
    }
    if (body.status != null && !DIRECT_UPDATE_STATUSES.has(body.status)) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
    }
    if (!validObject(body.public_payload)) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
    }
    const publicAccessProblem = validatePublicPayloadAccess(body.public_payload);
    if (publicAccessProblem) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
    }
    if (!validObject(body.private_payload)) {
      return send(res, 422, { error: { code: 'VALIDATION_ERROR', message: 'The request failed validation.' } });
    }
    const privateAccessProblem = validateOrganizationPrivatePayloadAccess(body.private_payload);
    if (privateAccessProblem) {
      return send(res, 403, { error: { code: 'FORBIDDEN', message: 'Authority-only fields are not available to organization users.' } });
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
module.exports._test = { bearer, parseBody, validUuid, validTimestamp, validObject, plainObject, validPublicPassport, validPublicResolve, validTechnicalPilotPassport, validPrivatePassport, validReadinessReport, validCompletenessReport, validAuthorityEvidenceReceipt, validateRpcShape, validatePublicPayloadAccess, validateOrganizationPrivatePayloadAccess, sanitizePublicPassport, sanitizePublicResolve, sanitizeOrganizationPrivatePassport, mapDatabaseError, rpc, PASSPORT_STATUSES, DIRECT_UPDATE_STATUSES, TERMINAL_PASSPORT_STATUSES, LIFECYCLE_REASONS, DEFAULT_RPC_TIMEOUT_MS };
