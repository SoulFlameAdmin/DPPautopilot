'use strict';

const {mapDatabaseError:mapSharedDatabaseError}=require('./_errors.js');
const {parseBody,bodyErrorResponse}=require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const {startRequestObservability}=require('./_observability.js');

const MEMBER_ROLES=new Set(['admin','editor','viewer']);

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

function validEmail(value){
  return typeof value==='string'&&value.length>=3&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requestDetail(req){
  try{
    const url=new URL(String(req&&req.url||'/api/members'),'https://dpp.local');
    return url.searchParams.get('detail')==='1';
  }catch{
    return false;
  }
}

function upstreamShapeError(){
  const error=new Error('UPSTREAM_ERROR');
  error.status=502;
  error.publicCode='UPSTREAM_ERROR';
  error.publicMessage='Database request failed.';
  return error;
}

function validMember(value){
  if(!(value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.user_id)&&typeof value.role==='string'&&
    ['owner','admin','editor','viewer'].includes(value.role))) return false;
  if(value.email!==undefined&&value.email!==null&&!validEmail(value.email)) return false;
  if(value.is_self!==undefined&&typeof value.is_self!=='boolean') return false;
  return true;
}

function validateRpcShape(name,data){
  if(name==='dpp_api_members_list'||name==='dpp_api_members_list_detail') return Array.isArray(data)&&data.every(validMember);
  if(name==='dpp_api_members_add'||name==='dpp_api_member_add_by_email'||name==='dpp_api_members_update') return validMember(data);
  if(name==='dpp_api_members_delete') return validUuid(data);
  return true;
}

function validateWrite(body,requireRole,allowEmail=false){
  const hasEmail=allowEmail&&typeof body.email==='string'&&body.email.trim().length>0;
  if(hasEmail){
    if(!validEmail(body.email.trim().toLowerCase())) return 'email must be valid';
  }else if(!validUuid(body.user_id)){
    return 'user_id must be a valid UUID';
  }
  if(requireRole&&!MEMBER_ROLES.has(body.role)) return 'role must be admin, editor or viewer';
  return null;
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('members',data);
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
      headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload||{}),
      signal:controller.signal
    });
    try{data=await response.json();}catch(error){
      if(controller.signal.aborted||error&&error.name==='AbortError') throw upstreamTimeoutError();
      if(response.ok){
        const invalid=new Error('UPSTREAM_ERROR');
        invalid.status=502;
        invalid.publicCode='UPSTREAM_ERROR';
        invalid.publicMessage='Database request failed.';
        throw invalid;
      }
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
  if(!validateRpcShape(name,data)) throw upstreamShapeError();
  return data;
}

async function handler(req,res){
  startRequestObservability(req,res,'members');
  const rateLimit=enforceRateLimit(req,res,'members');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());

  const authorization=bearer(req);
  if(!authorization) return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  const sharedRateLimit=await enforceSharedRateLimit(req,res,'members',authorization);
  if(sharedRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!sharedRateLimit.allowed) return send(res,429,rateLimitBody());


  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST','PATCH','DELETE'].includes(method)){
    res.setHeader('Allow','GET, POST, PATCH, DELETE');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  try{
    if(method==='GET'){
      const detailed=requestDetail(req);
      const members=await rpc(detailed?'dpp_api_members_list_detail':'dpp_api_members_list',{},authorization);
      return send(res,200,{data:members});
    }

    let body={};
    try{body=parseBody(req);}
    catch(error){
      const response=bodyErrorResponse(error);
      return send(res,response.status,response.body);
    }

    const problem=validateWrite(body,method!=='DELETE',method==='POST');
    if(problem) return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});

    if(method==='POST'){
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const member=email
        ?await rpc('dpp_api_member_add_by_email',{p_email:email,p_role:body.role},authorization)
        :await rpc('dpp_api_members_add',{p_user_id:body.user_id,p_role:body.role},authorization);
      return send(res,201,{data:member});
    }
    if(method==='PATCH'){
      const member=await rpc('dpp_api_members_update',{p_user_id:body.user_id,p_role:body.role},authorization);
      return send(res,200,{data:member});
    }

    const deleted=await rpc('dpp_api_members_delete',{p_user_id:body.user_id},authorization);
    return send(res,200,{data:{user_id:deleted,deleted:true}});
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
module.exports._test={bearer,validUuid,validEmail,requestDetail,validMember,validateRpcShape,validateWrite,mapDatabaseError,rpc,MEMBER_ROLES,DEFAULT_RPC_TIMEOUT_MS};
