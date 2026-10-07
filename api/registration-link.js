'use strict';

const { getSupabaseConfig } = require('./_supabase_config.js');

const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TIMEOUT_MS=10000;
const DEFAULT_PUBLIC_ORIGIN='https://dpp-autopilot.vercel.app';

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

function normalizeEmail(value){
  return typeof value==='string'?value.trim().toLowerCase():'';
}

function publicOrigin(env=process.env){
  const candidate=String(env.DPP_PUBLIC_ORIGIN||DEFAULT_PUBLIC_ORIGIN).trim();
  try{
    const url=new URL(candidate);
    if(url.protocol!=='https:') return DEFAULT_PUBLIC_ORIGIN;
    return url.origin;
  }catch{return DEFAULT_PUBLIC_ORIGIN}
}

function authConfig(env=process.env){
  return getSupabaseConfig(env);
}

async function jsonFetch(url,options={},timeoutMs=DEFAULT_TIMEOUT_MS,fetchImpl=fetch){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{...options,signal:controller.signal});
    let data={};
    try{data=await response.json()}catch{}
    return {response,data};
  }catch(error){
    const e=new Error(controller.signal.aborted?'UPSTREAM_TIMEOUT':'UPSTREAM_ERROR');
    e.status=controller.signal.aborted?504:502;
    e.publicCode=e.message;
    e.publicMessage=controller.signal.aborted?'Upstream request timed out.':'Upstream request failed.';
    throw e;
  }finally{clearTimeout(timer)}
}

async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch){
  const {base,key}=authConfig(env);
  const auth=authorization||('Bearer '+key);
  const {response,data}=await jsonFetch(base+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{apikey:key,Authorization:auth,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload||{})
  },DEFAULT_TIMEOUT_MS,fetchImpl);
  if(!response.ok){
    const error=new Error(data?.code||'DATABASE_REQUEST_FAILED');
    error.status=data?.code==='DP403'?403:data?.code==='DP404'?404:data?.code==='DP501'?422:response.status>=500?502:response.status;
    error.publicCode=data?.code==='DP403'?'FORBIDDEN':data?.code==='DP404'?'NOT_FOUND':data?.code==='DP501'?'VALIDATION_ERROR':'DATABASE_REQUEST_FAILED';
    error.publicMessage=error.status===422?'The request failed validation.':error.status===403?'Forbidden.':error.status===404?'Registration request not found.':'Database request failed.';
    throw error;
  }
  return data;
}

async function requestMagicLink(email,requestId,env=process.env,fetchImpl=fetch){
  const {base,key}=authConfig(env);
  const redirect=new URL('/company',publicOrigin(env));
  redirect.searchParams.set('dpp','1');
  redirect.searchParams.set('request',requestId);
  const endpoint=base+'/auth/v1/otp?redirect_to='+encodeURIComponent(redirect.toString());
  const {response,data}=await jsonFetch(endpoint,{
    method:'POST',
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({
      email,
      create_user:true,
      data:{
        dpp_company_onboarding:true,
        registration_request_id:requestId,
        Domain:new URL('/apply',publicOrigin(env)).toString()
      }
    })
  },DEFAULT_TIMEOUT_MS,fetchImpl);
  if(!response.ok){
    const error=new Error('EMAIL_LINK_SEND_FAILED');
    error.status=response.status===429?429:502;
    error.publicCode=response.status===429?'RATE_LIMITED':'EMAIL_LINK_SEND_FAILED';
    error.publicMessage=response.status===429?'Too many requests. Retry later.':'Registration email could not be sent.';
    throw error;
  }
  return data;
}

function handleError(res,error){
  const status=Number.isInteger(error.status)?error.status:502;
  const code=error.publicCode||'UPSTREAM_ERROR';
  const message=error.publicMessage||'Request failed.';
  return send(res,status,{error:{code,message}});
}

async function handler(req,res){
  startRequestObservability(req,res,'registration-link');
  const local=enforceRateLimit(req,res,'registration-link',{ruleName:'authenticated_write'});
  if(!local.allowed) return send(res,429,rateLimitBody());

  const method=String(req.method||'GET').toUpperCase();
  if(!['POST','PATCH','GET'].includes(method)){
    res.setHeader('Allow','GET, POST, PATCH');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  let body={};
  if(method!=='GET'){
    try{body=parseBody(req)}
    catch(error){
      const response=bodyErrorResponse(error);
      return send(res,response.status,response.body);
    }
  }

  if(method==='POST'){
    const email=normalizeEmail(body.email);
    if(!EMAIL_RE.test(email)||email.length>320){
      return send(res,422,{error:{code:'VALIDATION_ERROR',message:'Enter a valid email address.'}});
    }
    try{
      const created=await rpc('dpp_api_registration_request_create',{p_email:email},null);
      const requestId=created?.request_id;
      if(!UUID_RE.test(String(requestId||''))){
        const error=new Error('UPSTREAM_SHAPE_INVALID');
        error.status=502;error.publicCode='UPSTREAM_ERROR';error.publicMessage='Database request failed.';
        throw error;
      }
      await requestMagicLink(email,requestId);
      return send(res,202,{data:{
        request_id:requestId,
        email,
        status:'email_sent',
        message:'A unique one-time registration link was sent to the email address.'
      }});
    }catch(error){return handleError(res,error)}
  }

  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }

  if(method==='PATCH'){
    const requestId=String(body.request_id||'');
    if(!UUID_RE.test(requestId)){
      return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
    }
    try{
      const verified=await rpc('dpp_api_registration_request_verify',{p_request_id:requestId},authorization);
      return send(res,200,{data:verified});
    }catch(error){return handleError(res,error)}
  }

  try{
    const rows=await rpc('dpp_api_registration_requests_mine',{},authorization);
    return send(res,200,{data:Array.isArray(rows)?rows:[]});
  }catch(error){return handleError(res,error)}
}

module.exports=handler;
module.exports._test={normalizeEmail,publicOrigin,bearer,requestMagicLink,rpc,EMAIL_RE,UUID_RE,DEFAULT_PUBLIC_ORIGIN};
