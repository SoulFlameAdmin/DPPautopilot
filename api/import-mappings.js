'use strict';

const { mapDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
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
function validName(value){return typeof value==='string'&&value.trim().length>=1&&value.trim().length<=160}
function validFormat(value){return value==='csv'||value==='xlsx'}
function validHeaders(value){
  return Array.isArray(value)&&value.length>=1&&value.length<=100&&
    value.every(v=>typeof v==='string'&&v.trim().length>0)&&
    new Set(value.map(v=>v.trim().toLowerCase())).size===value.length;
}
function validMapping(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.entries(value).every(([k,v])=>k.trim().length>0&&typeof v==='string');
}
const DEFAULT_RPC_TIMEOUT_MS=8000;
function upstreamError(code='UPSTREAM_ERROR',message='Database request failed.',status=502){
  const error=new Error(code);error.publicCode=code;error.publicMessage=message;error.status=status;return error;
}
async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL||PUBLIC.supabaseUrl;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||PUBLIC.supabasePublishableKey;
  if(!base||!key)throw upstreamError('SERVER_CONFIGURATION_MISSING','Server configuration is incomplete.',500);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response,data=null;
  try{
    response=await fetchImpl(base.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{
      method:'POST',
      headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload||{}),
      signal:controller.signal
    });
    try{data=await response.json();}
    catch(error){
      if(controller.signal.aborted||error?.name==='AbortError')throw upstreamError('UPSTREAM_TIMEOUT','Database request timed out.',504);
      throw upstreamError();
    }
  }catch(error){
    if(controller.signal.aborted||error?.name==='AbortError')throw upstreamError('UPSTREAM_TIMEOUT','Database request timed out.',504);
    if(error?.publicCode)throw error;
    throw upstreamError();
  }finally{clearTimeout(timer)}
  if(!response.ok){
    const mapped=mapDatabaseError('imports',data);
    throw upstreamError(mapped.code,mapped.message,mapped.status);
  }
  return data;
}
async function handler(req,res){
  startRequestObservability(req,res,'import_mappings');
  const local=enforceRateLimit(req,res,'imports');
  if(!local.allowed)return send(res,429,rateLimitBody());
  const authorization=bearer(req);
  if(!authorization)return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});

  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST','DELETE'].includes(method)){
    res.setHeader('Allow','GET, POST, DELETE');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const shared=await enforceSharedRateLimit(req,res,'imports',authorization,{ruleName:method==='GET'?'authenticated_read':'authenticated_write'});
  if(shared.error)return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed)return send(res,429,rateLimitBody());

  let body={};
  if(method==='POST'){
    try{body=parseBody(req);}
    catch(error){const response=bodyErrorResponse(error);return send(res,response.status,response.body);}
  }

  try{
    if(method==='GET'){
      const value=await rpc('dpp_api_import_mapping_list',{},authorization);
      return send(res,200,{data:Array.isArray(value)?value:[]});
    }
    if(method==='DELETE'){
      const id=req.query&&req.query.id;
      if(!validUuid(id))return send(res,400,{error:{code:'INVALID_IMPORT_MAPPING_ID',message:'A valid mapping UUID is required.'}});
      const value=await rpc('dpp_api_import_mapping_delete',{p_id:id},authorization);
      return send(res,200,{data:value});
    }

    if(body.id!=null&&!validUuid(body.id)){
      return send(res,422,{error:{code:'INVALID_IMPORT_PAYLOAD',message:'The import mapping payload is invalid.'}});
    }
    if(!validName(body.name)||!validFormat(body.source_format)||!validHeaders(body.source_headers)||!validMapping(body.field_mapping)){
      return send(res,422,{error:{code:'INVALID_IMPORT_PAYLOAD',message:'The import mapping payload is invalid.'}});
    }
    const value=await rpc('dpp_api_import_mapping_save',{
      p_id:body.id||null,
      p_name:body.name.trim(),
      p_source_format:body.source_format,
      p_source_headers:body.source_headers.map(v=>v.trim()),
      p_field_mapping:body.field_mapping
    },authorization);
    return send(res,200,{data:value});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    return send(res,status,{error:{code:error.publicCode||'UPSTREAM_ERROR',message:error.publicMessage||'Database request failed.'}});
  }
}
module.exports=handler;
module.exports._test={bearer,validUuid,validName,validFormat,validHeaders,validMapping,rpc,DEFAULT_RPC_TIMEOUT_MS};
