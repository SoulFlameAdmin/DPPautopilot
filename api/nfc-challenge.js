'use strict';

const { parseBody, bodyErrorResponse } = require('./_request.js');
const { issueChallenge, sha256 } = (() => {
  const core = require('./_nfc_crypto.js');
  return { issueChallenge: core.issueChallenge, sha256: v => require('node:crypto').createHash('sha256').update(v).digest('hex') };
})();

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
function validAlias(v){return typeof v==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(v);}
async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key) throw Object.assign(new Error('SERVER_CONFIGURATION_MISSING'),{status:500});
  const response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload)
  });
  let data=null; try{data=await response.json();}catch(_){}
  if(!response.ok) throw Object.assign(new Error('UPSTREAM_ERROR'),{status:response.status>=500?502:response.status});
  return data;
}
async function handler(req,res){
  if(String(req.method||'').toUpperCase()!=='POST'){
    res.setHeader('Allow','POST'); return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const authorization=bearer(req);
  if(!authorization) return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  let body={}; try{body=parseBody(req);}catch(e){const x=bodyErrorResponse(e);return send(res,x.status,x.body);}
  if(!validAlias(body.public_alias)) return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
  const issued=issueChallenge({ttlSeconds:120});
  const context=`${body.public_alias}:${issued.challenge_hash}`;
  try{
    const rows=await rpc('dpp_api_nfc_challenge_create',{
      p_public_alias:body.public_alias,
      p_challenge_hash:issued.challenge_hash,
      p_context_hash:sha256(context),
      p_expires_at:issued.expires_at
    },authorization);
    const row=Array.isArray(rows)?rows[0]:rows;
    if(!row||!row.challenge_id) throw Object.assign(new Error('UPSTREAM_ERROR'),{status:502});
    return send(res,201,{data:{
      schema:'dpp.nfc.verification.v1',
      challenge_id:row.challenge_id,
      challenge:issued.challenge,
      public_alias:row.public_alias,
      mode:row.mode,
      algorithm_id:row.algorithm_id,
      expires_at:row.expires_at
    }});
  }catch(e){
    const status=Number.isInteger(e.status)?e.status:502;
    return send(res,status,{error:{code:status===500?'SERVER_CONFIGURATION_MISSING':'UPSTREAM_ERROR',message:status>=500?'Database request failed.':'Request failed.'}});
  }
}
module.exports=handler;
module.exports._test={bearer,validAlias,rpc};
