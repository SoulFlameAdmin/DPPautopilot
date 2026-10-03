'use strict';

const QRCode = require('qrcode');
const { enforceRateLimit, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function validIdentifier(value) {
  return typeof value === 'string' &&
    value.trim().length >= 1 &&
    value.trim().length <= 300;
}

function safeHost(value) {
  if (typeof value !== 'string') return null;
  const first = value.split(',')[0].trim();
  if (!first || /[\r\n\\/]/.test(first)) return null;
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(first)) return null;
  return first;
}

function requestBaseUrl(req, env = process.env) {
  const configured = env.DPP_PUBLIC_BASE_URL;
  if (configured) {
    let parsed;
    try { parsed = new URL(configured); } catch { parsed = null; }
    if (parsed && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
      return parsed.origin;
    }
  }

  const headers = req.headers || {};
  const host = safeHost(headers['x-forwarded-host'] || headers.host);
  if (!host) return null;
  const forwardedProto = String(headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = forwardedProto === 'http' ? 'http' : 'https';
  return `${proto}://${host}`;
}

function passportUrl(identifier, baseUrl) {
  return `${baseUrl}/passport?identifier=${encodeURIComponent(identifier.trim())}`;
}

async function handler(req, res) {
  startRequestObservability(req,res,'qr');
  const rateLimit = enforceRateLimit(req,res,'qr');
  if (!rateLimit.allowed) return json(res, 429, rateLimitBody());

  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Unsupported method.' } });
  }

  const identifier = req.query && req.query.identifier;
  if (!validIdentifier(identifier)) {
    return json(res, 400, { error: { code: 'INVALID_IDENTIFIER', message: 'identifier must contain 1..300 characters.' } });
  }

  const baseUrl = requestBaseUrl(req);
  if (!baseUrl) {
    return json(res, 500, { error: { code: 'PUBLIC_BASE_URL_UNAVAILABLE', message: 'Public passport base URL is unavailable.' } });
  }

  const target = passportUrl(identifier, baseUrl);

  try {
    const svg = await QRCode.toString(target, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 512,
      color: { dark: '#000000', light: '#ffffff' }
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline; filename="battery-dpp-qr.svg"');
    res.end(svg);
  } catch {
    return json(res, 500, { error: { code: 'QR_GENERATION_FAILED', message: 'QR generation failed.' } });
  }
}

module.exports = handler;
module.exports._test = { validIdentifier, safeHost, requestBaseUrl, passportUrl };
