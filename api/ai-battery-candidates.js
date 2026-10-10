'use strict';
/** Authenticated, feature-gated candidate-only endpoint; never persists, signs or publishes. */
const {parseBody,bodyErrorResponse}=require('./_request.js');
const {enforceRateLimit,enforceSharedRateLimit,sharedRateLimitUnavailableBody,rateLimitBody}=require('./_rate_limit.js');
const {startRequestObservability}=require('./_observability.js');
const {LMTAuthError,validateBearerSupabase}=require('./_ai_lmt_auth.js');
const {LMTTenantError,validateManufacturerTenant}=require('./_ai_lmt_tenant_gate.js');
const {BatteryGPTError,MAX_PROMPT_CHARS,extractBatteryCandidates}=require('./_ai_lmt_candidate_extractor.js');
function send(res,status,body){
 res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));
}
const bearer=req=>{
 const a=req?.headers?.authorization??req?.headers?.Authorization;
 return typeof a==='string'&&/^Bearer\s+\S+$/i.test(a)?a:null;
};
function validateBody(body){
 return !!(body&&typeof body==='object'&&!Array.isArray(body)&&
  Object.keys(body).sort().join(',')==='prompt'&&typeof body.prompt==='string'&&
  body.prompt.trim()&&body.prompt.length<=MAX_PROMPT_CHARS);
}
const enabled=env=>String(env.AI_BATTERY_CANDIDATE_API_ENABLED||'').toLowerCase()==='true';
// Paid GPT calls require the distributed per-network and per-credential budget,
// not merely the process-local limiter of one serverless isolate.
const distributedBudgetEnabled=env=>String(env.DPP_SHARED_RATE_LIMIT_ENABLED||'').toLowerCase()==='true';
function createHandler({env=process.env,fetchImpl=globalThis.fetch}={}){
 return async function aiBatteryCandidates(req,res){
  startRequestObservability(req,res,'ai-battery-candidates');
  if(!enforceRateLimit(req,res,'ai-battery-candidates').allowed)return send(res,429,rateLimitBody());
  const auth=bearer(req);
  if(!auth)return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication required.'}});
  if(String(req.method||'GET').toUpperCase()!=='POST'){
   res.setHeader('Allow','POST');
   return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}});
  }
  let body;
  try{body=parseBody(req);}catch(error){
   const r=bodyErrorResponse(error);return send(res,r.status,r.body);
  }
  if(!validateBody(body))return send(res,422,{error:{code:'INVALID_REQUEST',message:'Exactly one bounded prompt is required.'}});
  if(!enabled(env))return send(res,503,{error:{code:'FEATURE_DISABLED',message:'LMT candidate preview is disabled.'}});
  if(!distributedBudgetEnabled(env))return send(res,503,{error:{code:'AI_RATE_GUARD_REQUIRED',message:'Distributed request protection is required.'}});
  const shared=await enforceSharedRateLimit(req,res,'ai-battery-candidates',auth,{env,fetchImpl});
  if(shared.error)return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed)return send(res,429,rateLimitBody());
  try{
   // Authenticates the USER, not tenant/product membership. No DB read or write here.
   await validateBearerSupabase(auth,{env,fetchImpl});
   // A valid user token is not permission to spend on behalf of a manufacturer.
   // Derive active org and writable role ONLY from the server-side tenant context RPC.
   await validateManufacturerTenant(auth,{env,fetchImpl});
   const data=await extractBatteryCandidates({prompt:body.prompt,env,fetchImpl});
   return send(res,200,{data});
  }catch(error){
   if(error instanceof LMTAuthError)return send(res,error.status,{error:{code:error.code,message:'Authentication failed.'}});
   if(error instanceof LMTTenantError)return send(res,error.status,{error:{code:error.code,message:'Active manufacturer authorization required.'}});
   if(error instanceof BatteryGPTError)return send(res,error.status,{error:{code:error.code,message:'Candidate preview failed.'}});
   if(Number.isInteger(error?.status)&&error?.publicCode)
    return send(res,error.status,{error:{code:error.publicCode,message:error.publicMessage||'Request failed.'}});
   return send(res,502,{error:{code:'UPSTREAM_ERROR',message:'Candidate preview unavailable.'}});
  }
 };
}
const handler=createHandler();
module.exports=handler;
module.exports._test={bearer,validateBody,enabled,distributedBudgetEnabled,createHandler};
