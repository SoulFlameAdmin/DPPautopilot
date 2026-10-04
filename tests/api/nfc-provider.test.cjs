'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const p=require('../../api/_nfc_provider.js');

function input(){
  return {schema:'dpp.nfc.verification.v1',public_alias:'battery_12345678',
    challenge_id:'11111111-1111-4111-8111-111111111111',
    challenge:'challenge-bytes',challenge_hash:'a'.repeat(64),counter:7,tamper_state:'clear'};
}

test('PKI adapter verifies real P-256 ECDSA signature',async()=>{
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const i=input(); const msg=p.canonicalMessage(i);
  i.proof=crypto.sign('sha256',msg,privateKey).toString('base64url');
  const result=await p.verifySecureNfcProof(i,{
    lifecycle_state:'active',mode:'pki_ecc',algorithm_id:'ecdsa-p256-sha256',
    public_key_pem:publicKey.export({type:'spki',format:'pem'}),tamper_state:'clear'
  });
  assert.deepEqual(result,{result:'authentic',reason_code:'proof_valid'});
});

test('PKI adapter rejects modified message',async()=>{
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const signed=input();
  signed.proof=crypto.sign('sha256',p.canonicalMessage(signed),privateKey).toString('base64url');
  signed.challenge='modified';
  const result=await p.verifySecureNfcProof(signed,{
    lifecycle_state:'active',mode:'pki_ecc',algorithm_id:'ecdsa-p256-sha256',
    public_key_pem:publicKey.export({type:'spki',format:'pem'}),tamper_state:'clear'
  });
  assert.equal(result.result,'invalid');
});

test('revoked identity fails before crypto',async()=>{
  const result=await p.verifySecureNfcProof({...input(),proof:'AA'},{
    lifecycle_state:'revoked',mode:'pki_ecc',algorithm_id:'ecdsa-p256-sha256'
  });
  assert.equal(result.result,'revoked');
});

test('tampered identity fails before crypto',async()=>{
  const result=await p.verifySecureNfcProof({...input(),proof:'AA'},{
    lifecycle_state:'active',tamper_state:'tampered',mode:'pki_ecc',algorithm_id:'ecdsa-p256-sha256'
  });
  assert.equal(result.result,'tampered');
});

test('AES/SUN never accepts raw secret and fails closed without protected verifier',async()=>{
  const result=await p.verifySecureNfcProof({...input(),proof:'AA'},{
    lifecycle_state:'active',tamper_state:'clear',mode:'aes_sun',
    algorithm_id:'aes-cmac-sun',protected_key_reference:'kms://nfc/example'
  });
  assert.deepEqual(result,{result:'backend_error',reason_code:'kms_verifier_unconfigured'});
});

test('AES/SUN protected verifier boolean contract',async()=>{
  const identity={lifecycle_state:'active',tamper_state:'clear',mode:'aes_sun',
    algorithm_id:'aes-cmac-sun',protected_key_reference:'kms://nfc/example'};
  assert.equal((await p.verifySecureNfcProof({...input(),proof:'AA'},identity,{
    verifyAesSunWithProtectedKey:async()=>true
  })).result,'authentic');
  assert.equal((await p.verifySecureNfcProof({...input(),proof:'AA'},identity,{
    verifyAesSunWithProtectedKey:async()=>false
  })).result,'invalid');
});
