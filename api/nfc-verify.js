'use strict';

const { parseBody, bodyErrorResponse } = require('./_request.js');
const { validateProofEnvelope, proofFingerprint, publicVerificationResult } = require('./_nfc_crypto.js');
const crypto=require('node:crypto');

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}
function bearer(req){
  const v=req.headers&&(req.headers.authorization||req.headers.Authorization);
  return typeof v==='string'&&/^Bearer\s+\S+$/i.test(v)?v:null;
}
function validUuid(v){return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function contextHash(publicAlias,challengeHash){
  return crypto.createHash('sha256').update(`${publicAlias}:${challengeHash}`).digest('hex');
}

/*
 * Provider boundary. The API deliberately refuses to invent cryptography.
 * A hardware-specific adapter must return a strict result only after verifying
 * PKI/ECDSA or AES/SUN proof with the protected trust material.
 */
async function verifyProviderProof(_input,_deps={}){
  return {result:'backend_error',reason_code:'proof_provider_unconfigured'};
}

async function handler(req,res,deps={}){
  if(String(req.method||'').toUpperCase()!=='POST'){
    res.setHeader('Allow','POST');return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const authorization=bearer(req);
  if(!authorization) return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  let body={};try{body=parseBody(req);}catch(e){const x=bodyErrorResponse(e);return send(res,x.status,x.body);}
  const check=validateProofEnvelope(body);
  if(!check.ok||!validUuid(body.challenge_id)){
    return send(res,422,{data:publicVerificationResult('invalid',{reason_code:check.code||'invalid_challenge'})});
  }

  const verifier=deps.verifyProviderProof||verifyProviderProof;
  let provider;
  try{provider=await verifier({
    schema:body.schema,mode:body.mode,public_alias:body.public_alias,
    challenge_id:body.challenge_id,proof:body.proof,counter:body.counter
  },deps);}
  catch(_){provider={result:'backend_error',reason_code:'proof_provider_error'};}

  const allowed=new Set(['authentic','invalid','revoked','unregistered','tampered','backend_error']);
  if(!provider||!allowed.has(provider.result)){
    provider={result:'backend_error',reason_code:'proof_provider_invalid_contract'};
  }

  // DB challenge consumption/event persistence is intentionally a separate
  // adapter boundary. Until wired, an otherwise authentic proof must fail closed.
  if(provider.result==='authentic'&&!deps.consumeAndRecord){
    provider={result:'backend_error',reason_code:'persistence_boundary_unconfigured'};
  }

  if(deps.consumeAndRecord){
    try{
      provider=await deps.consumeAndRecord({
        authorization,challenge_id:body.challenge_id,public_alias:body.public_alias,
        result:provider.result,reason_code:provider.reason_code,
        proof_hash:proofFingerprint(body.proof),counter:body.counter||null
      });
    }catch(_){provider={result:'backend_error',reason_code:'persistence_error'};}
  }

  return send(res,200,{data:publicVerificationResult(provider.result,{
    reason_code:provider.reason_code,
    verification_id:provider.verification_id||null,
    battery_public_alias:body.public_alias
  })});
}
module.exports=handler;
module.exports._test={bearer,validUuid,contextHash,verifyProviderProof};
