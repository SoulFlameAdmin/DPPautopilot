'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const x=require('../../api/_nfc_ntag_x_dna.js');

function fixture(){
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const input={
    rnd_a:crypto.randomBytes(16).toString('base64url'),
    rnd_b:crypto.randomBytes(16).toString('base64url'),
    opts_a:Buffer.from([0x80,0x01,0x01]).toString('base64url')
  };
  input.proof=crypto.sign('sha256',x.unilateralMessage(input),{
    key:privateKey,dsaEncoding:'ieee-p1363'
  }).toString('base64url');
  const identity={
    algorithm_id:x.ALGORITHM_ID,
    public_key_pem:publicKey.export({type:'spki',format:'pem'})
  };
  return {input,identity};
}

test('builds NTAG X DNA unilateral message with F0F0 prefix and 16-byte randoms',()=>{
  const {input}=fixture();
  const msg=x.unilateralMessage(input);
  assert.equal(msg[0],0xF0);
  assert.equal(msg[1],0xF0);
  assert.equal(msg.length,2+3+16+16);
});

test('verifies real P-256 64-byte IEEE-P1363 proof',()=>{
  const {input,identity}=fixture();
  assert.deepEqual(
    x.verifyUnilateralProof(input,identity),
    {result:'authentic',reason_code:'ntag_x_dna_unilateral_proof_valid'}
  );
});

test('modified reader challenge fails',()=>{
  const {input,identity}=fixture();
  input.rnd_a=crypto.randomBytes(16).toString('base64url');
  assert.equal(x.verifyUnilateralProof(input,identity).result,'invalid');
});

test('wrong public key fails',()=>{
  const {input,identity}=fixture();
  const other=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey;
  identity.public_key_pem=other.export({type:'spki',format:'pem'});
  assert.equal(x.verifyUnilateralProof(input,identity).result,'invalid');
});

test('malformed random/signature lengths fail closed',()=>{
  const {input,identity}=fixture();
  input.rnd_b=crypto.randomBytes(15).toString('base64url');
  assert.equal(x.verifyUnilateralProof(input,identity).result,'invalid');
  const f=fixture();
  f.input.proof=crypto.randomBytes(63).toString('base64url');
  assert.equal(x.verifyUnilateralProof(f.input,f.identity).result,'invalid');
});

test('noncanonical base64url is rejected',()=>{
  assert.throws(()=>x.decodeCanonicalB64url('AQ=='),/invalid_base64url/);
});
