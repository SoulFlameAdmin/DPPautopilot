'use strict';

const crypto=require('node:crypto');

const ALLOWED_EC_CURVES=new Set(['prime256v1','secp256r1']);
const ALLOWED_EC_ALGS=new Set(['ecdsa-p256-sha256']);
const ALLOWED_AES_ALGS=new Set(['aes-cmac-sun']);

function decodeB64url(value,max=4096){
  if(typeof value!=='string'||!value||value.length>max*2) throw new TypeError('invalid encoding');
  const out=Buffer.from(value,'base64url');
  if(!out.length||out.length>max) throw new TypeError('invalid encoding');
  return out;
}
function canonicalMessage(input){
  const required=['schema','public_alias','challenge_id','challenge','challenge_hash'];
  for(const k of required) if(typeof input[k]!=='string'||!input[k]) throw new TypeError(`missing ${k}`);
  return Buffer.from([
    input.schema,input.public_alias,input.challenge_id,input.challenge,input.challenge_hash,
    input.counter==null?'':String(input.counter),
    input.tamper_state||''
  ].join('\n'),'utf8');
}
function verifyEcdsaP256(input,identity){
  if(!ALLOWED_EC_ALGS.has(identity.algorithm_id)) return {result:'invalid',reason_code:'unsupported_algorithm'};
  if(typeof identity.public_key_pem!=='string'||!identity.public_key_pem.includes('PUBLIC KEY')){
    return {result:'backend_error',reason_code:'public_key_unavailable'};
  }
  let key;
  try{key=crypto.createPublicKey(identity.public_key_pem);}catch(_){return {result:'backend_error',reason_code:'public_key_invalid'};}
  const details=key.asymmetricKeyDetails||{};
  if(key.asymmetricKeyType!=='ec'||(details.namedCurve&&!ALLOWED_EC_CURVES.has(details.namedCurve))){
    return {result:'invalid',reason_code:'key_type_invalid'};
  }
  let signature;
  try{signature=decodeB64url(input.proof,512);}catch(_){return {result:'invalid',reason_code:'proof_encoding_invalid'};}
  let ok=false;
  try{ok=crypto.verify('sha256',canonicalMessage(input),key,signature);}catch(_){return {result:'invalid',reason_code:'proof_invalid'};}
  return ok?{result:'authentic',reason_code:'proof_valid'}:{result:'invalid',reason_code:'proof_invalid'};
}

/*
 * AES/SUN must be implemented behind a KMS/HSM/vendor verifier. Raw tag keys are
 * deliberately not accepted by this module.
 */
async function verifyAesSun(input,identity,deps={}){
  if(!ALLOWED_AES_ALGS.has(identity.algorithm_id)) return {result:'invalid',reason_code:'unsupported_algorithm'};
  if(typeof identity.protected_key_reference!=='string'||!identity.protected_key_reference){
    return {result:'backend_error',reason_code:'key_reference_unavailable'};
  }
  if(typeof deps.verifyAesSunWithProtectedKey!=='function'){
    return {result:'backend_error',reason_code:'kms_verifier_unconfigured'};
  }
  const result=await deps.verifyAesSunWithProtectedKey({
    keyReference:identity.protected_key_reference,
    message:canonicalMessage(input),
    proof:input.proof,
    counter:input.counter
  });
  if(result===true) return {result:'authentic',reason_code:'proof_valid'};
  if(result===false) return {result:'invalid',reason_code:'proof_invalid'};
  return {result:'backend_error',reason_code:'kms_verifier_invalid_contract'};
}

async function verifySecureNfcProof(input,identity,deps={}){
  if(!identity||identity.lifecycle_state!=='active') {
    if(identity&&['revoked','replaced'].includes(identity.lifecycle_state)) return {result:'revoked',reason_code:'identity_revoked'};
    return {result:'unregistered',reason_code:'identity_inactive'};
  }
  if(identity.tamper_state==='tampered') return {result:'tampered',reason_code:'tamper_asserted'};
  if(identity.valid_from&&Date.now()<Date.parse(identity.valid_from)) return {result:'invalid',reason_code:'identity_not_yet_valid'};
  if(identity.valid_until&&Date.now()>=Date.parse(identity.valid_until)) return {result:'revoked',reason_code:'identity_expired'};
  if(identity.mode==='pki_ecc') return verifyEcdsaP256(input,identity);
  if(identity.mode==='aes_sun') return verifyAesSun(input,identity,deps);
  return {result:'invalid',reason_code:'unsupported_mode'};
}

module.exports={canonicalMessage,verifyEcdsaP256,verifyAesSun,verifySecureNfcProof};
