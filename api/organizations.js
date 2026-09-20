'use strict';

const {mapDatabaseError:mapSharedDatabaseError}=require('./_errors.js');
const {parseBody,bodyErrorResponse}=require('./_request.js');
const {enforceRateLimit,rateLimitBody}=require('./_rate_limit.js');
const {startRequestObservability}=require('./_observability.js');

const SLUG_RE=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function validateCreate(body){
  if(typeof body.name!=='string'||body.name.trim().length<1||body.name.trim().length>200){
    return 'name must contain 1..200 characters';
  }
  if(typeof body.slug!=='string'||body.slug.length<1||body.slug.length>120||!SLUG_RE.test(body.slug)){
    return 'slug must be lowercase kebab-case and contain 1..120 characters';
  }
  return null;
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('organizations',data);
  return [mapped.status,mapped.code,mapped.message];
}

async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch){
  const base=env.SUPABASE_URL;
  const key=env.SUPABASE_ANON_KEY;
  if(!base||!key){
    const error=new Error('SERVER_CONFIGURATION_MISSING');
    error.status=500;
    throw error;
  }
  const response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload||{})
  });
  let data=null;
  try{data=await response.json();}catch(_){data=null;}
  if(!response.ok){
    const [status,publicCode,publicMessage]=mapDatabaseError(data);
    const error=new Error(publicCode);
    error.status=status;
    error.publicCode=publicCode;
    error.publicMessage=publicMessage;
    throw error;
  }
  return data;
}

async function handler(req,res){
  startRequestObservability(req,res,'organizations');
  const rateLimit=enforceRateLimit(req,res,'organizations');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());

  const authorization=bearer(req);
  if(!authorization) return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});

  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method)){
    res.setHeader('Allow','GET, POST');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  if(method==='GET'){
    try{
      const organizations=await rpc('dpp_api_organizations_list',{},authorization);
      return send(res,200,{data:organizations});
    }catch(error){
      const status=Number.isInteger(error.status)?error.status:502;
      const code=error.publicCode||error.message||'UPSTREAM_ERROR';
      const message=error.publicMessage||(status===500
        ?'Server configuration is incomplete.'
        :status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase());
      return send(res,status,{error:{code,message}});
    }
  }

  let body={};
  try{body=parseBody(req);}
  catch(error){
    const response=bodyErrorResponse(error);
    return send(res,response.status,response.body);
  }

  const problem=validateCreate(body);
  if(problem) return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});

  try{
    const organization=await rpc('dpp_api_organization_create',{
      p_name:body.name.trim(),
      p_slug:body.slug
    },authorization);
    return send(res,201,{data:organization});
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
module.exports._test={bearer,validateCreate,mapDatabaseError,rpc,SLUG_RE};
