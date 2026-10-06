'use strict';

const crypto=require('node:crypto');
const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const TENANT_ROLES=new Set(['owner','admin','editor','viewer']);
const API_SCOPES=new Set([
  'passports:read',
  'passports:write',
  'imports:write',
  'exports:read',
  'carriers:write',
  'webhooks:manage'
]);
const DEFAULT_RPC_TIMEOUT_MS=8000;

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
  return typeof value==='string'&&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validIsoDate(value){
  return value===null||(typeof value==='string'&&Number.isFinite(Date.parse(value)));
}
function validCredentialScopes(value){
  return Array.isArray(value)&&value.length>=1&&value.length<=API_SCOPES.size&&
    value.every(scope=>typeof scope==='string'&&API_SCOPES.has(scope))&&
    new Set(value).size===value.length;
}
function validCredential(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.id)&&typeof value.name==='string'&&value.name.length>=1&&value.name.length<=160&&
    /^sf_dpp_[0-9a-f]{10}$/.test(value.key_prefix)&&validCredentialScopes(value.scopes)&&
    ['active','revoked'].includes(value.status)&&validIsoDate(value.expires_at)&&
    validIsoDate(value.last_used_at)&&validIsoDate(value.created_at)&&validIsoDate(value.revoked_at)&&
    (value.revoke_reason===null||typeof value.revoke_reason==='string');
}
function validTenantContext(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.memberships)) return false;
  if(value.active_organization_id!==null&&!validUuid(value.active_organization_id)) return false;
  if(!value.memberships.every(member=>member&&typeof member==='object'&&!Array.isArray(member)&&
    validUuid(member.organization_id)&&TENANT_ROLES.has(member.role)&&typeof member.active==='boolean')) return false;
  const ids=value.memberships.map(member=>member.organization_id);
  if(new Set(ids).size!==ids.length) return false;
  const active=value.memberships.filter(member=>member.active);
  if(value.active_organization_id===null) return active.length===0;
  return active.length===1&&active[0].organization_id===value.active_organization_id;
}
function validCredentialName(value){
  return typeof value==='string'&&value.trim().length>=1&&value.trim().length<=160;
}
function normalizeExpiresAt(days){
  if(days===null||days===undefined||days===0||days==='0') return null;
  const numeric=Number(days);
  if(!Number.isInteger(numeric)||numeric<1||numeric>365) return undefined;
  return new Date(Date.now()+numeric*86400000).toISOString();
}
function generateCredentialMaterial(){
  const prefix='sf_dpp_'+crypto.randomBytes(5).toString('hex');
  const secret=crypto.randomBytes(32).toString('base64url');
  const apiKey=prefix+'_'+secret;
  const secretHash=crypto.createHash('sha256').update(apiKey,'utf8').digest('hex');
  return {prefix,apiKey,secretHash};
}
function upstreamShapeError(){
  const error=new Error('UPSTREAM_ERROR');
  error.status=502;
  error.publicCode='UPSTREAM_ERROR';
  error.publicMessage='Database request failed.';
  return error;
}
function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('tenant',data);
  return [mapped.status,mapped.code,mapped.message];
}
function upstreamTimeoutError(){
  const error=new Error('UPSTREAM_TIMEOUT');
  error.status=504;
  error.publicCode='UPSTREAM_TIMEOUT';
  error.publicMessage='Database request timed out.';
  return error;
}
async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key){
    const error=new Error('SERVER_CONFIGURATION_MISSING');
    error.status=500;
    throw error;
  }

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  let data=null;
  try{
    response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{
        apikey:key,
        Authorization:authorization,
        'Content-Type':'application/json',
        Accept:'application/json'
      },
      body:JSON.stringify(payload||{}),
      signal:controller.signal
    });
    try{data=await response.json();}catch(error){
      if(controller.signal.aborted||error&&error.name==='AbortError') throw upstreamTimeoutError();
      if(response.ok) throw upstreamShapeError();
      data=null;
    }
  }catch(error){
    if(controller.signal.aborted||error&&error.name==='AbortError') throw upstreamTimeoutError();
    if(error&&error.publicCode) throw error;
    const upstream=new Error('UPSTREAM_ERROR');
    upstream.status=502;
    upstream.publicCode='UPSTREAM_ERROR';
    upstream.publicMessage='Database request failed.';
    throw upstream;
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

  if((name==='dpp_api_tenant_context'||name==='dpp_api_tenant_context_set')&&!validTenantContext(data)) throw upstreamShapeError();
  if(name==='dpp_api_credentials_list'&&(!Array.isArray(data)||!data.every(validCredential))) throw upstreamShapeError();
  if(['dpp_api_credential_create','dpp_api_credential_revoke','dpp_api_credential_rotate'].includes(name)&&!validCredential(data)) throw upstreamShapeError();
  return data;
}

async function handler(req,res){
  startRequestObservability(req,res,'tenant');
  const rateLimit=enforceRateLimit(req,res,'tenant');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());

  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }
  const sharedRateLimit=await enforceSharedRateLimit(req,res,'tenant',authorization);
  if(sharedRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!sharedRateLimit.allowed) return send(res,429,rateLimitBody());

  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method)){
    res.setHeader('Allow','GET, POST');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  try{
    if(method==='GET'){
      if(String(req.query&&req.query.credentials||'')==='1'){
        const value=await rpc('dpp_api_credentials_list',{},authorization);
        return send(res,200,{data:value});
      }
      const value=await rpc('dpp_api_tenant_context',{},authorization);
      return send(res,200,{data:value});
    }

    let body={};
    try{body=parseBody(req);}
    catch(error){
      const response=bodyErrorResponse(error);
      return send(res,response.status,response.body);
    }

    if(body.action==='create_api_credential'){
      if(!validCredentialName(body.name)||!validCredentialScopes(body.scopes)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The API credential request failed validation.'}});
      }
      const expiresAt=normalizeExpiresAt(body.expires_days);
      if(expiresAt===undefined){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'expires_days must be 0 or an integer from 1 to 365.'}});
      }
      const material=generateCredentialMaterial();
      const value=await rpc('dpp_api_credential_create',{
        p_name:body.name.trim(),
        p_key_prefix:material.prefix,
        p_secret_hash:material.secretHash,
        p_scopes:body.scopes,
        p_expires_at:expiresAt
      },authorization);
      return send(res,201,{data:{...value,api_key:material.apiKey}});
    }

    if(body.action==='rotate_api_credential'){
      if(!validUuid(body.id)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'A valid API credential id is required.'}});
      }
      const material=generateCredentialMaterial();
      const value=await rpc('dpp_api_credential_rotate',{
        p_id:body.id,
        p_key_prefix:material.prefix,
        p_secret_hash:material.secretHash
      },authorization);
      return send(res,200,{data:{...value,api_key:material.apiKey}});
    }

    if(body.action==='revoke_api_credential'){
      if(!validUuid(body.id)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'A valid API credential id is required.'}});
      }
      const reason=typeof body.reason==='string'&&body.reason.trim()?body.reason.trim():'manual revoke';
      if(reason.length>500){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The revoke reason is too long.'}});
      }
      const value=await rpc('dpp_api_credential_revoke',{p_id:body.id,p_reason:reason},authorization);
      return send(res,200,{data:value});
    }

    if(!validUuid(body.organization_id)){
      return send(res,422,{error:{code:'INVALID_ORGANIZATION_ID',message:'organization_id must be a valid UUID.'}});
    }

    const value=await rpc(
      'dpp_api_tenant_context_set',
      {p_organization_id:body.organization_id},
      authorization
    );
    return send(res,200,{data:value});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=error.publicMessage||(status===500
      ?'Server configuration is incomplete.'
      :status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={
  bearer,validUuid,validTenantContext,validCredential,validCredentialName,validCredentialScopes,
  normalizeExpiresAt,generateCredentialMaterial,mapDatabaseError,rpc,TENANT_ROLES,API_SCOPES,DEFAULT_RPC_TIMEOUT_MS
};
