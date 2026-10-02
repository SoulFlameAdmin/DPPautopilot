'use strict';

const crypto = require('node:crypto');

const PROTOCOL_SCHEMA = 'dpp.nfc.verification.v1';
const RESULT_VALUES = Object.freeze([
  'authentic', 'invalid', 'replay', 'expired',
  'revoked', 'unregistered', 'tampered', 'backend_error'
]);
const SUPPORTED_MODES = new Set(['pki_ecc', 'aes_sun']);
const MAX_PROOF_BYTES = 4096;
const DEFAULT_CHALLENGE_TTL_SECONDS = 120;

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function issueChallenge(options = {}) {
  const ttl = Number.isInteger(options.ttlSeconds)
    ? options.ttlSeconds
    : DEFAULT_CHALLENGE_TTL_SECONDS;
  if (ttl < 30 || ttl > 300) throw new TypeError('challenge TTL must be 30..300 seconds');

  const now = options.now instanceof Date ? options.now : new Date();
  const challenge = b64url(crypto.randomBytes(32));
  return Object.freeze({
    challenge,
    challenge_hash: sha256(challenge),
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl * 1000).toISOString()
  });
}

function validateProofEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'invalid_envelope' };
  }
  if (input.schema !== PROTOCOL_SCHEMA) return { ok: false, code: 'unsupported_version' };
  if (!SUPPORTED_MODES.has(input.mode)) return { ok: false, code: 'unsupported_algorithm' };
  if (typeof input.public_alias !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(input.public_alias)) {
    return { ok: false, code: 'invalid_alias' };
  }
  if (typeof input.proof !== 'string' || input.proof.length === 0) {
    return { ok: false, code: 'invalid_proof' };
  }
  let decoded;
  try { decoded = Buffer.from(input.proof, 'base64url'); }
  catch (_) { return { ok: false, code: 'invalid_proof' }; }
  if (!decoded.length || decoded.length > MAX_PROOF_BYTES) {
    return { ok: false, code: 'invalid_proof' };
  }
  if (input.challenge_id != null &&
      (typeof input.challenge_id !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(input.challenge_id))) {
    return { ok: false, code: 'invalid_challenge' };
  }
  return { ok: true };
}

function classifyChallenge(record, now = new Date()) {
  if (!record) return 'invalid';
  if (record.consumed_at) return 'replay';
  const expiry = Date.parse(record.expires_at);
  if (!Number.isFinite(expiry)) return 'invalid';
  if (now.getTime() >= expiry) return 'expired';
  return null;
}

function proofFingerprint(proof) {
  if (typeof proof !== 'string' || !proof) throw new TypeError('proof is required');
  return sha256(proof);
}

function publicVerificationResult(result, fields = {}) {
  if (!RESULT_VALUES.includes(result)) throw new TypeError('unsupported verification result');
  const body = {
    schema: PROTOCOL_SCHEMA,
    result,
    reason_code: String(fields.reason_code || 'unspecified').slice(0, 80),
    verification_id: fields.verification_id || null,
    battery_public_alias: fields.battery_public_alias || null,
    verified_at: fields.verified_at || new Date().toISOString()
  };
  // Deliberately allowlist public fields. Never spread caller input here.
  return Object.freeze(body);
}

module.exports = {
  PROTOCOL_SCHEMA,
  RESULT_VALUES,
  MAX_PROOF_BYTES,
  DEFAULT_CHALLENGE_TTL_SECONDS,
  issueChallenge,
  validateProofEnvelope,
  classifyChallenge,
  proofFingerprint,
  publicVerificationResult
};
