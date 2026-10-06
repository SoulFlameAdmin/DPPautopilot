'use strict';

const { mapDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const MAX_SYSTEMS=30;
const VALID_STATUSES=new Set(['submitted','reviewing','quoted','awaiting_payment','paid','activated','rejected']);

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

function plainObject(value){
  return value&&typeof value==='object'&&!Array.isArray(value);
}

function intOrNull(value,min,max){
  if(value===null||value===undefined||value==='') return null;
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max) return undefined;
  return n;
}

function validateSubmit(body){
  if(!plainObject(body)) return 'body';
  const company=typeof body.company_name==='string'?body.company_name.trim():'';
  if(!company||company.length>200) return 'company_name';
  if(typeof body.contact_name!=='string'||body.contact_name.length>200) return 'contact_name';
  if(typeof body.country!=='string'||body.country.length>120) return 'country';
  if(body.website!=null&&(typeof body.website!=='string'||body.website.length>500)) return 'website';
  if(typeof body.product_categories!=='string'||body.product_categories.length>2000) return 'product_categories';
  if(typeof body.notes!=='string'||body.notes.length>5000) return 'notes';
  if(!Array.isArray(body.systems)||body.systems.length>MAX_SYSTEMS||body.systems.some(v=>typeof v!=='string'||v.trim().length<1||v.trim().length>120)) return 'systems';
  const employees=intOrNull(body.employees_count,1,1000000);
  const users=intOrNull(body.dpp_users_count,1,1000000);
  const sites=intOrNull(body.production_sites_count,0,100000);
  const skus=intOrNull(body.sku_count,0,100000000);
  const units=intOrNull(body.annual_units,0,1000000000000);
  if(employees===undefined) return 'employees_count';
  if(users===undefined) return 'dpp_users_count';
  if(sites===undefined) return 'production_sites_count';
  if(skus===undefined) return 'sku_count';
  if(units===undefined) return 'annual_units';
  return null;
}

function validApplication(value){
  return plainObject(value)&&
    typeof value.application_id==='string'&&
    typeof value.company_name==='string'&&
    typeof value.status==='string'&&VALID_STATUSES.has(value.status)&&
    typeof value.created_at==='string'&&
    typeof value.updated_at==='string';
}

function validSubmitResult(value){
  return validApplication(value)&&typeof value.email==='string'&&value.email.includes('@');
}

function validMineResult(value){
  return Array.isArray(value)&&value.every(validApplication);
}

function upstreamShapeError(){
  const error=new Error('UPSTREAM_ERROR');
  error.status=502;
  error.publicCode='UPSTREAM_ERROR';
  error.publicMessage='Database request failed.';
  return error;
}

const DEFAULT_RPC_TIMEOUT_MS=8000;

async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key){
    const error=new Error('SERVER_CONFIGURATION_MISSING');
    error.status=500;
    throw error;
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response,data=null;
  try{
    response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload||{}),
      signal:controller.signal
    });
    try{data=await response.json();}catch(error){
      if(controller.signal.aborted||error?.name==='AbortError'){
        const timeout=new Error('UPSTREAM_TIMEOUT');timeout.status=504;timeout.publicCode='UPSTREAM_TIMEOUT';timeout.publicMessage='Database request timed out.';throw timeout;
      }
      if(response.ok) throw upstreamShapeError();
    }
  }catch(error){
    if(error?.publicCode) throw error;
    if(controller.signal.aborted||error?.name==='AbortError'){
      const timeout=new Error('UPSTREAM_TIMEOUT');timeout.status=504;timeout.publicCode='UPSTREAM_TIMEOUT';timeout.publicMessage='Database request timed out.';throw timeout;
    }
    const upstream=new Error('UPSTREAM_ERROR');
    upstream.status=502;upstream.publicCode='UPSTREAM_ERROR';upstream.publicMessage='Database request failed.';
    throw upstream;
  }finally{clearTimeout(timer)}

  if(!response.ok){
    const mapped=mapDatabaseError('application',data);
    const error=new Error(mapped.code);
    error.status=mapped.status;error.publicCode=mapped.code;error.publicMessage=mapped.message;
    throw error;
  }

  if(name==='dpp_api_client_application_submit'&&!validSubmitResult(data)) throw upstreamShapeError();
  if(name==='dpp_api_client_applications_mine'&&!validMineResult(data)) throw upstreamShapeError();
  return data;
}

function errorResponse(res,error){
  const status=Number.isInteger(error.status)?error.status:502;
  const code=error.publicCode||error.message||'UPSTREAM_ERROR';
  const message=error.publicMessage||(status===500?'Server configuration is incomplete.':status>=500?'Database request failed.':'The request failed.');
  return send(res,status,{error:{code,message}});
}

async function handler(req,res){
  startRequestObservability(req,res,'application');
  const local=enforceRateLimit(req,res,'application');
  if(!local.allowed) return send(res,429,rateLimitBody());

  const authorization=bearer(req);
  if(!authorization) return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});

  const shared=await enforceSharedRateLimit(req,res,'application',authorization);
  if(shared.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed) return send(res,429,rateLimitBody());

  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method)){
    res.setHeader('Allow','GET, POST');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  if(method==='GET'){
    try{
      const applications=await rpc('dpp_api_client_applications_mine',{},authorization);
      return send(res,200,{data:applications});
    }catch(error){return errorResponse(res,error)}
  }

  let body;
  try{body=parseBody(req);}
  catch(error){
    const response=bodyErrorResponse(error);
    return send(res,response.status,response.body);
  }

  const problem=validateSubmit(body);
  if(problem) return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});

  try{
    const application=await rpc('dpp_api_client_application_submit',{
      p_company_name:body.company_name.trim(),
      p_contact_name:body.contact_name.trim(),
      p_country:body.country.trim(),
      p_website:body.website?body.website.trim():null,
      p_employees_count:intOrNull(body.employees_count,1,1000000),
      p_dpp_users_count:intOrNull(body.dpp_users_count,1,1000000),
      p_production_sites_count:intOrNull(body.production_sites_count,0,100000),
      p_systems:body.systems.map(v=>v.trim()),
      p_product_categories:body.product_categories.trim(),
      p_sku_count:intOrNull(body.sku_count,0,100000000),
      p_annual_units:intOrNull(body.annual_units,0,1000000000000),
      p_notes:body.notes.trim()
    },authorization);
    return send(res,201,{data:application});
  }catch(error){return errorResponse(res,error)}
}

module.exports=handler;
module.exports._test={bearer,plainObject,intOrNull,validateSubmit,validApplication,validSubmitResult,validMineResult,rpc,DEFAULT_RPC_TIMEOUT_MS};
