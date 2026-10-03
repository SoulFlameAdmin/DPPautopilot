'use strict';

const crypto=require('node:crypto');

const ALGORITHM_ID='ntag-x-dna-ecc-unilateral-p256-sha256';
const P256_CURVES=new Set(['prime256v1','secp256r1']);

function decodeCanonicalB64url(value,{min=1,max=4096,exact=null}={}){
  if(typeof value!=='string'||!value||value.includes('=')||!/^[A-Za-z0-9_-]+$/.test(value)){
    throw new TypeError('invalid_base64url');
  }
  const out=Buffer.from(value,'base64url');
  if(out.toString('base64url')!==value) throw new TypeError('noncanonical_base64url');
  if(exact!=null&&out.length!==exact) throw new TypeError('invalid_length');
  if(out.length<min||out.length>max) throw new TypeError('invalid_length');
  return out;
}

/*
 * NXP NTAG X DNA ECC card-unilateral authentication signs:
 *   0xF0F0 || [OptsA full TLV] || RndB || RndA
 * using ECDSA P-256 + SHA-256. RndA and RndB are 16 bytes each.
 *
 * This helper verifies only the cryptographic proof using an already-trusted
 * public key. Certificate-chain/originality validation and DPP challenge
 * persistence/anti-replay remain separate mandatory boundaries.
 */
function unilateralMessage(input){
  const rndA=decodeCanonicalB64url(input.rnd_a,{exact:16});
  const rndB=decodeCanonicalB64url(input.rnd_b,{exact:16});
  let opts=Buffer.alloc(0);
  if(input.opts_a!=null&&input.opts_a!==''){
    opts=decodeCanonicalB64url(input.opts_a,{min:1,max:512});
  }
  return Buffer.concat([Buffer.from([0xF0,0xF0]),opts,rndB,rndA]);
}

function loadP256PublicKey(pem){
  if(typeof pem!=='string'||!pem.includes('PUBLIC KEY')) throw new TypeError('public_key_unavailable');
  const key=crypto.createPublicKey(pem);
  const details=key.asymmetricKeyDetails||{};
  if(key.asymmetricKeyType!=='ec'||(details.namedCurve&&!P256_CURVES.has(details.namedCurve))){
    throw new TypeError('public_key_not_p256');
  }
  return key;
}

function verifyUnilateralProof(input,identity){
  if(!identity||identity.algorithm_id!==ALGORITHM_ID){
    return {result:'invalid',reason_code:'unsupported_algorithm'};
  }

  let key,message,signature;
  try{
    key=loadP256PublicKey(identity.public_key_pem);
    message=unilateralMessage(input);
    signature=decodeCanonicalB64url(input.proof,{exact:64});
  }catch(error){
    const code=String(error&&error.message||'invalid_input');
    if(code.startsWith('public_key_')) return {result:'backend_error',reason_code:code};
    return {result:'invalid',reason_code:'ntag_x_dna_proof_format_invalid'};
  }

  let ok=false;
  try{
    ok=crypto.verify('sha256',message,{key,dsaEncoding:'ieee-p1363'},signature);
  }catch(_){
    return {result:'invalid',reason_code:'ntag_x_dna_proof_invalid'};
  }
  return ok
    ? {result:'authentic',reason_code:'ntag_x_dna_unilateral_proof_valid'}
    : {result:'invalid',reason_code:'ntag_x_dna_unilateral_proof_invalid'};
}

module.exports={ALGORITHM_ID,decodeCanonicalB64url,unilateralMessage,verifyUnilateralProof};
