'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const { findRestrictedPublicPaths, findAuthorityOnlyPaths, sanitizeOrganizationPrivatePayload } = require('./_access_policy.js');
const PUBLIC = require('./_public_config.js');

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}
function bearer(req){
  const value=req.headers&&(req.headers.authorization||req.headers.Authorization);
  return typeof value==='string'&&/^Bearer\s+\S+$/i.test(value)?value:null;
}
function validUuid(value){
  return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function plainObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function validTimestamp(value){return typeof value==='string'&&value.trim().length>0&&Number.isFinite(Date.parse(value));}
function canonicalOrigin(env=process.env){
  const value=String(env.DPP_PUBLIC_ORIGIN||PUBLIC.publicOrigin||'').trim();
  if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value))throw new Error('PUBLIC_ORIGIN_INVALID');
  return value.replace(/\/$/,'');
}
function validateBody(body){
  if(!plainObject(body)||!validUuid(body.battery_item_id))return {status:422,code:'VALIDATION_ERROR'};
  const pub=body.public_payload==null?{}:body.public_payload;
  const priv=body.private_payload==null?{}:body.private_payload;
  if(!plainObject(pub)||!plainObject(priv))return {status:422,code:'VALIDATION_ERROR'};
  if(!plainObject(pub.item)||typeof pub.item.unique_identifier!=='string'||!pub.item.unique_identifier.trim()){
    return {status:422,code:'VALIDATION_ERROR'};
  }
  if(findRestrictedPublicPaths(pub).length)return {status:422,code:'VALIDATION_ERROR'};
  if(findAuthorityOnlyPaths(priv).length)return {status:403,code:'FORBIDDEN'};
  return {publicPayload:pub,privatePayload:priv};
}
function validPilotResult(value){
  return plainObject(value)&&
    validUuid(value.passport_id)&&validUuid(value.battery_item_id)&&validUuid(value.model_id)&&
    typeof value.unique_identifier==='string'&&value.unique_identifier.trim().length>=1&&value.unique_identifier.trim().length<=300&&
    value.status==='active'&&plainObject(value.public_payload)&&plainObject(value.private_payload)&&
    value.technical_pilot===true&&value.regulatory_compliance===false&&
    typeof value.created==='boolean'&&typeof value.idempotent_replay==='boolean'&&
    validTimestamp(value.created_at)&&validTimestamp(value.updated_at);
}
function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('passport',data);
  return [mapped.status,mapped.code,mapped.message];
}
const DEFAULT_RPC_TIMEOUT_MS=10000;
function upstreamTimeoutError(){const e=new Error('UPSTREAM_TIMEOUT');e.status=504;e.publicCode='UPSTREAM_TIMEOUT';e.publicMessage='Database request timed out.';return e;}
function upstreamInvalidJsonError(){const e=new Error('UPSTREAM_ERROR');e.status=502;e.publicCode='UPSTREAM_ERROR';e.publicMessage='Database request failed.';return e;}
async function rpc(payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL||PUBLIC.supabaseUrl;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||PUBLIC.supabasePublishableKey;
  if(!base||!key){const e=new Error('SERVER_CONFIGURATION_MISSING');e.status=500;throw e;}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let response,data=null;
  try{
    response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_api_technical_pilot_publish`,{
      method:'POST',
      headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload),
      signal:controller.signal
    });
    try{data=await response.json();}catch(error){
      if(controller.signal.aborted||error&&error.name==='AbortError')throw upstreamTimeoutError();
      if(response.ok)throw upstreamInvalidJsonError();
    }
  }catch(error){
    if(controller.signal.aborted||error&&error.name==='AbortError')throw upstreamTimeoutError();
    if(error&&error.publicCode)throw error;
    throw upstreamInvalidJsonError();
  }finally{clearTimeout(timeout);}
  if(!response.ok){
    const [status,publicCode,publicMessage]=mapDatabaseError(data);
    const e=new Error(publicCode);e.status=status;e.publicCode=publicCode;e.publicMessage=publicMessage;throw e;
  }
  if(!validPilotResult(data))throw upstreamInvalidJsonError();
  return data;
}
async function handler(req,res){
  startRequestObservability(req,res,'technical-pilot');
  const local=enforceRateLimit(req,res,'technical-pilot');
  if(!local.allowed)return send(res,429,rateLimitBody());
  const method=String(req.method||'POST').toUpperCase();
  if(method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});}
  const authorization=bearer(req);
  if(!authorization)return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  const shared=await enforceSharedRateLimit(req,res,'technical-pilot',authorization,{ruleName:'authenticated_write'});
  if(shared.error)return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed)return send(res,429,rateLimitBody());

  let body={};
  try{body=parseBody(req);}catch(error){const response=bodyErrorResponse(error);return send(res,response.status,response.body);}
  const checked=validateBody(body);
  if(checked.status){
    return send(res,checked.status,{error:{code:checked.code,message:checked.code==='FORBIDDEN'?'The request is not permitted.':'The request failed validation.'}});
  }

  try{
    const result=await rpc({
      p_battery_item_id:body.battery_item_id,
      p_public_payload:checked.publicPayload,
      p_private_payload:checked.privatePayload
    },authorization);
    const origin=canonicalOrigin();
    const id=encodeURIComponent(result.unique_identifier);
    const safePrivate=sanitizeOrganizationPrivatePayload(result.private_payload);
    const data={
      ...result,
      private_payload:safePrivate,
      passport_url:`${origin}/passport?identifier=${id}`,
      qr_url:`${origin}/qr?identifier=${id}`,
      qr_api_url:`${origin}/api/qr?identifier=${id}`
    };
    return send(res,result.idempotent_replay?200:201,{data});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=error.publicMessage||(status===500?'Server configuration is incomplete.':status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}
module.exports=handler;
module.exports._test={
  bearer,validUuid,plainObject,validTimestamp,canonicalOrigin,validateBody,validPilotResult,
  mapDatabaseError,rpc,DEFAULT_RPC_TIMEOUT_MS
};
