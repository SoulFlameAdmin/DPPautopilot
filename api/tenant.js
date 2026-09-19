'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { startRequestObservability } = require('./_observability.js');

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

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('tenant',data);
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
    headers:{
      apikey:key,
      Authorization:authorization,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
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
  startRequestObservability(req,res,'tenant');

  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }

  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method)){
    res.setHeader('Allow','GET, POST');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  try{
    if(method==='GET'){
      const value=await rpc('dpp_api_tenant_context',{},authorization);
      return send(res,200,{data:value});
    }

    let body={};
    try{body=parseBody(req);}
    catch(error){
      const response=bodyErrorResponse(error);
      return send(res,response.status,response.body);
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
module.exports._test={bearer,validUuid,mapDatabaseError,rpc};
