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

function validateWrite(body,requireRole){
  if(!validUuid(body.user_id)) return 'user_id must be a valid UUID';
  if(requireRole&&!MEMBER_ROLES.has(body.role)) return 'role must be admin, editor or viewer';
  return null;
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('members',data);
  return [mapped.status,mapped.code,mapped.message];
}

async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
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
      const members=await rpc('dpp_api_members_list',{},authorization);
      return send(res,200,{data:members});
    }

    let body={};
    try{body=parseBody(req);}
    catch(error){
      const response=bodyErrorResponse(error);
      return send(res,response.status,response.body);
    }

    const problem=validateWrite(body,method!=='DELETE');
    if(problem) return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});

    if(method==='POST'){
      const member=await rpc('dpp_api_members_add',{p_user_id:body.user_id,p_role:body.role},authorization);
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
module.exports._test={bearer,validUuid,validateWrite,mapDatabaseError,rpc,MEMBER_ROLES};
