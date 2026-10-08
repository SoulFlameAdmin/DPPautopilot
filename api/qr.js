'use strict';

const qrcode = require('../vendor/qrcode-generator.js');
const { enforceRateLimit, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const PUBLIC = require('./_public_config.js');

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function normalizeIdentifier(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 300) return null;
  if(/[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function canonicalOrigin(env = process.env) {
  const value = String(env.DPP_PUBLIC_ORIGIN || PUBLIC.publicOrigin || '').trim();
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) {
    throw new Error('PUBLIC_ORIGIN_INVALID');
  }
  return value.replace(/\/$/, '');
}

function buildPassportUrl(identifier, env = process.env) {
  return canonicalOrigin(env) + '/passport?identifier=' + encodeURIComponent(identifier) + '&carrier=qr';
}

function renderQrSvg(targetUrl) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, 'M');
  qr.addData(targetUrl, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 32, scalable: true });
}

const DEFAULT_VERIFY_TIMEOUT_MS = 8000;

async function verifyActivePassport(identifier, env = process.env, fetchImpl = fetch, timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS) {
  const base = String(env.DPP_SUPABASE_URL || env.SUPABASE_URL || PUBLIC.supabaseUrl || '').replace(/\/$/, '');
  const key = env.DPP_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || PUBLIC.supabasePublishableKey;
  if (!base || !key) throw new Error('SERVER_CONFIGURATION_MISSING');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(base + '/rest/v1/rpc/dpp_api_passport_public_resolve', {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_unique_identifier: identifier }),
      signal: controller.signal
    });

    let data = null;
    try { data = await response.json(); } catch {}

    if (!response.ok) {
      if (response.status >= 500) throw new Error('UPSTREAM_ERROR');
      return false;
    }

    return !!data &&
      data.kind === 'active' &&
      data.status === 'active' &&
      data.unique_identifier === identifier;
  } catch (error) {
    if (controller.signal.aborted || (error && error.name === 'AbortError')) {
      throw new Error('UPSTREAM_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function handler(req, res) {
  startRequestObservability(req,res,'qr');
  const rateLimit = enforceRateLimit(req,res,'qr');
  if (!rateLimit.allowed) return sendJson(res,429,rateLimitBody());

  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  const identifier = normalizeIdentifier(req.query && (req.query.identifier || req.query.id));
  if (!identifier) {
    return sendJson(res,400,{error:{code:'INVALID_IDENTIFIER',message:'identifier must contain 1..300 printable characters.'}});
  }

  let active = false;
  try {
    active = await verifyActivePassport(identifier);
  } catch (error) {
    const code = error && error.message === 'UPSTREAM_TIMEOUT' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR';
    const status = code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
    return sendJson(res,status,{error:{code,message:'Public passport verification failed.'}});
  }
  if (!active) {
    return sendJson(res,404,{error:{code:'PUBLIC_PASSPORT_NOT_FOUND',message:'An ACTIVE public passport is required before a QR can be generated.'}});
  }

  let targetUrl;
  let svg;
  try {
    targetUrl = buildPassportUrl(identifier);
    svg = renderQrSvg(targetUrl);
  } catch {
    return sendJson(res,500,{error:{code:'QR_GENERATION_FAILED',message:'QR carrier could not be generated.'}});
  }

  const download = req.query && String(req.query.download || '') === '1';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  // Active-only QR availability is a revocable status decision; do not cache
  // prior ACTIVE SVG responses across a later DRAFT/suspend/revoke transition.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', (download ? 'attachment' : 'inline') + '; filename="dpp-passport-qr.svg"');
  res.setHeader('X-DPP-Carrier', 'qr');
  res.setHeader('X-DPP-Identifier', identifier);
  res.setHeader('X-DPP-Target', targetUrl);
  res.end(svg);
}

module.exports = handler;
module.exports._test = {
  normalizeIdentifier,
  canonicalOrigin,
  buildPassportUrl,
  renderQrSvg,
  verifyActivePassport,
  DEFAULT_VERIFY_TIMEOUT_MS
};
