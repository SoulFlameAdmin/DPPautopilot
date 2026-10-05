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

function handler(req, res) {
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
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Disposition', (download ? 'attachment' : 'inline') + '; filename="dpp-passport-qr.svg"');
  res.setHeader('X-DPP-Carrier', 'qr');
  res.setHeader('X-DPP-Identifier', identifier);
  res.setHeader('X-DPP-Target', targetUrl);
  res.end(svg);
}

module.exports = handler;
module.exports._test = { normalizeIdentifier, canonicalOrigin, buildPassportUrl, renderQrSvg };
