'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { enforceRateLimit, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Disposition','attachment; filename="dpp-export.json"');
  res.end(JSON.stringify(body));
}

function bearer(req){
  const value=req.headers&&(req.headers.authorization||req.headers.Authorization);
  return typeof value==='string'&&/^Bearer\s+\S+$/i.test(value)?value:null;
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('export',data);
  return [mapped.status,mapped.code,mapped.message];
}

async function rpc(authorization,env=process.env,fetchImpl=fetch){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key){
    const error=new Error('SERVER_CONFIGURATION_MISSING');
    error.status=500;
    throw error;
  }
  const response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_api_export_bundle`,{
    method:'POST',
    headers:{
      apikey:key,
      Authorization:authorization,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:'{}'
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
  startRequestObservability(req,res,'export');
  const rateLimit=enforceRateLimit(req,res,'export');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());
  const method=String(req.method||'GET').toUpperCase();
  if(method!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }
  try{
    const bundle=await rpc(authorization);
    return send(res,200,{data:bundle});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=error.publicMessage||(status===500?'Server configuration is incomplete.':
      status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={bearer,mapDatabaseError,rpc};
