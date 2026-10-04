'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const { findRestrictedPublicPaths, findAuthorityOnlyPaths } = require('./_access_policy.js');
const PUBLIC = require('./_public_config.js');

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

function bearer(req){
  const value=req.headers && (req.headers.authorization || req.headers.Authorization);
  return typeof value==='string' && /^Bearer\s+\S+$/i.test(value) ? value : null;
}

function validUuid(value){
  return typeof value==='string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function plainObject(value){
  return !!value && typeof value==='object' && !Array.isArray(value);
}

function validTimestamp(value){
  return typeof value==='string' && value.trim().length>0 && Number.isFinite(Date.parse(value));
}

function normalizeIdentifier(value){
  if(typeof value!=='string') return null;
  const normalized=value.trim();
  if(!normalized || normalized.length>300) return null;
  if(/[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function canonicalOrigin(env=process.env){
  const value=String(env.DPP_PUBLIC_ORIGIN || PUBLIC.publicOrigin || '').trim();
  if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) throw new Error('PUBLIC_ORIGIN_INVALID');
  return value.replace(/\/$/,'');
}

function validateBody(body){
  if(!plainObject(body)) return {status:422,code:'VALIDATION_ERROR'};
  if(!validUuid(body.model_id)) return {status:422,code:'VALIDATION_ERROR'};
  const identifier=normalizeIdentifier(body.unique_identifier);
  if(!identifier) return {status:422,code:'VALIDATION_ERROR'};

  const itemCanonical=body.item_canonical_data == null ? {} : body.item_canonical_data;
  const publicPayload=body.public_payload == null ? {} : body.public_payload;
  const privatePayload=body.private_payload == null ? {} : body.private_payload;
  if(!plainObject(itemCanonical) || !plainObject(publicPayload) || !plainObject(privatePayload)){
    return {status:422,code:'VALIDATION_ERROR'};
  }

  if(!plainObject(publicPayload.item) || publicPayload.item.unique_identifier!==identifier){
    return {status:422,code:'VALIDATION_ERROR'};
  }
  const category=publicPayload.model && publicPayload.model.identification && publicPayload.model.identification.category;
  if(category != null && category!=='light_means_of_transport'){
    return {status:422,code:'VALIDATION_ERROR'};
  }

  if(findRestrictedPublicPaths(publicPayload).length){
    return {status:422,code:'VALIDATION_ERROR'};
  }
  if(findAuthorityOnlyPaths(privatePayload).length){
    return {status:403,code:'FORBIDDEN'};
  }

  return {identifier,itemCanonical,publicPayload,privatePayload};
}

function validProvisionResult(value){
  return plainObject(value) &&
    validUuid(value.item_id) &&
    validUuid(value.passport_id) &&
    validUuid(value.model_id) &&
    typeof value.unique_identifier==='string' &&
    value.unique_identifier.trim().length>=1 &&
    value.unique_identifier.trim().length<=300 &&
    value.lifecycle_status==='original' &&
    value.passport_status==='active' &&
    plainObject(value.public_payload) &&
    typeof value.created_item==='boolean' &&
    typeof value.created_passport==='boolean' &&
    typeof value.idempotent_replay==='boolean' &&
    validTimestamp(value.created_at) &&
    validTimestamp(value.updated_at);
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('provision',data);
  return [mapped.status,mapped.code,mapped.message];
}

const DEFAULT_RPC_TIMEOUT_MS=8000;

function upstreamTimeoutError(){
  const error=new Error('UPSTREAM_TIMEOUT');
  error.status=504;
  error.publicCode='UPSTREAM_TIMEOUT';
  error.publicMessage='Database request timed out.';
  return error;
}

function upstreamInvalidJsonError(){
  const error=new Error('UPSTREAM_ERROR');
  error.status=502;
  error.publicCode='UPSTREAM_ERROR';
  error.publicMessage='Database request failed.';
  return error;
}

async function rpc(payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL || env.SUPABASE_URL || PUBLIC.supabaseUrl;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || PUBLIC.supabasePublishableKey;
  if(!base || !key){
    const error=new Error('SERVER_CONFIGURATION_MISSING');
    error.status=500;
    throw error;
  }

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  let data=null;
  try{
    response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_api_scooter_battery_provision`,{
      method:'POST',
      headers:{
        apikey:key,
        Authorization:authorization,
        'Content-Type':'application/json',
        Accept:'application/json'
      },
      body:JSON.stringify(payload),
      signal:controller.signal
    });
    try{
      data=await response.json();
    }catch(error){
      if(controller.signal.aborted || (error && error.name==='AbortError')) throw upstreamTimeoutError();
      if(response.ok) throw upstreamInvalidJsonError();
      data=null;
    }
  }catch(error){
    if(controller.signal.aborted || (error && error.name==='AbortError')) throw upstreamTimeoutError();
    if(error && error.publicCode) throw error;
    throw upstreamInvalidJsonError();
  }finally{
    clearTimeout(timeout);
  }

  if(!response.ok){
    const [status,publicCode,publicMessage]=mapDatabaseError(data);
    const error=new Error(publicCode);
    error.status=status;
    error.publicCode=publicCode;
    error.publicMessage=publicMessage;
    throw error;
  }
  if(!validProvisionResult(data)) throw upstreamInvalidJsonError();
  return data;
}

async function handler(req,res){
  startRequestObservability(req,res,'provision');
  const localLimit=enforceRateLimit(req,res,'provision');
  if(!localLimit.allowed) return send(res,429,rateLimitBody());

  const method=String(req.method || 'POST').toUpperCase();
  if(method!=='POST'){
    res.setHeader('Allow','POST');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }

  const sharedLimit=await enforceSharedRateLimit(req,res,'provision',authorization,{ruleName:'authenticated_write'});
  if(sharedLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!sharedLimit.allowed) return send(res,429,rateLimitBody());

  let body={};
  try{
    body=parseBody(req);
  }catch(error){
    const response=bodyErrorResponse(error);
    return send(res,response.status,response.body);
  }

  const checked=validateBody(body);
  if(checked.status){
    const message=checked.code==='FORBIDDEN'
      ? 'The request is not permitted.'
      : 'The request failed validation.';
    return send(res,checked.status,{error:{code:checked.code,message}});
  }

  try{
    const result=await rpc({
      p_model_id:body.model_id,
      p_unique_identifier:checked.identifier,
      p_item_canonical_data:checked.itemCanonical,
      p_public_payload:checked.publicPayload,
      p_private_payload:checked.privatePayload
    },authorization);

    const origin=canonicalOrigin();
    const identifier=encodeURIComponent(result.unique_identifier);
    const data={
      ...result,
      passport_url:`${origin}/passport?identifier=${identifier}`,
      qr_url:`${origin}/qr?identifier=${identifier}`,
      qr_api_url:`${origin}/api/qr?identifier=${identifier}`
    };
    return send(res,result.idempotent_replay?200:201,{data});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode || error.message || 'UPSTREAM_ERROR';
    const message=error.publicMessage || (status===500
      ? 'Server configuration is incomplete.'
      : status>=500
        ? 'Database request failed.'
        : code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={
  bearer,validUuid,plainObject,validTimestamp,normalizeIdentifier,canonicalOrigin,
  validateBody,validProvisionResult,mapDatabaseError,rpc,DEFAULT_RPC_TIMEOUT_MS
};
