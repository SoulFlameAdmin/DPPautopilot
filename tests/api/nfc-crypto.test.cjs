'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('../../api/_nfc_crypto.js');

test('CR12 challenge is random, hashed and short-lived', () => {
  const now = new Date('2026-10-02T00:00:00.000Z');
  const a = crypto.issueChallenge({now, ttlSeconds: 120});
  const b = crypto.issueChallenge({now, ttlSeconds: 120});
  assert.notEqual(a.challenge, b.challenge);
  assert.equal(a.challenge.length >= 40, true);
  assert.equal(a.challenge_hash.length, 64);
  assert.equal(a.expires_at, '2026-10-02T00:02:00.000Z');
});

test('CR12 rejects unsafe challenge TTLs', () => {
  assert.throws(() => crypto.issueChallenge({ttlSeconds: 10}), /30\.\.300/);
  assert.throws(() => crypto.issueChallenge({ttlSeconds: 301}), /30\.\.300/);
});

test('CR14 validates a minimal supported proof envelope', () => {
  const result = crypto.validateProofEnvelope({
    schema: crypto.PROTOCOL_SCHEMA,
    mode: 'pki_ecc',
    public_alias: 'battery_public_01',
    challenge_id: 'challenge_01',
    proof: Buffer.from('synthetic-proof').toString('base64url')
  });
  assert.deepEqual(result, {ok:true});
});

test('CR14 rejects unsupported modes and malformed envelopes', () => {
  assert.equal(crypto.validateProofEnvelope(null).ok, false);
  assert.deepEqual(crypto.validateProofEnvelope({
    schema: crypto.PROTOCOL_SCHEMA,
    mode: 'custom_crypto',
    public_alias: 'battery_public_01',
    proof: 'YWJj'
  }), {ok:false, code:'unsupported_algorithm'});
});

test('CR15 classifies consumed challenge as replay before expiry', () => {
  const now = new Date('2026-10-02T00:00:00.000Z');
  assert.equal(crypto.classifyChallenge({
    expires_at:'2026-10-02T00:02:00.000Z',
    consumed_at:'2026-10-02T00:00:30.000Z'
  }, now), 'replay');
});

test('CR15 classifies expired challenge fail closed', () => {
  const now = new Date('2026-10-02T00:03:00.000Z');
  assert.equal(crypto.classifyChallenge({
    expires_at:'2026-10-02T00:02:00.000Z',
    consumed_at:null
  }, now), 'expired');
});

test('CR16 exposes only allowed public verification fields', () => {
  const result = crypto.publicVerificationResult('invalid', {
    reason_code:'proof_invalid',
    verification_id:'verify_123',
    battery_public_alias:'battery_public_01',
    secret:'DO_NOT_LEAK',
    tenant_id:'DO_NOT_LEAK'
  });
  assert.deepEqual(Object.keys(result), [
    'schema','result','reason_code','verification_id','battery_public_alias','verified_at'
  ]);
  assert.equal(JSON.stringify(result).includes('DO_NOT_LEAK'), false);
});

test('CR16 rejects invented result states', () => {
  assert.throws(() => crypto.publicVerificationResult('probably_authentic'), /unsupported/);
});

test('CR17 proof fingerprint is deterministic without retaining raw proof', () => {
  const proof='c3ludGhldGljLXByb29m';
  const a=crypto.proofFingerprint(proof);
  const b=crypto.proofFingerprint(proof);
  assert.equal(a,b);
  assert.equal(a.length,64);
  assert.equal(a.includes(proof),false);
});
