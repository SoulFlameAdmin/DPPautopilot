'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const { getSupabaseConfig } = require('./_supabase_config.js');

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

const IMPORT_STATUSES=new Set(['staged','validated','invalid','committed']);

function validTimestamp(value){
  return typeof value==='string'&&value.trim().length>0&&Number.isFinite(Date.parse(value));
}

function validNullableTimestamp(value){
  return value===null||validTimestamp(value);
}

function validNonNegativeInteger(value){
  return Number.isInteger(value)&&value>=0;
}

function validImportCreate(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.import_id)&&value.status==='staged'&&
    Number.isInteger(value.staged_rows)&&value.staged_rows>=1&&value.staged_rows<=1000;
}

function validImportGet(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.import_id)&&
    (value.mapping_id===null||validUuid(value.mapping_id))&&
    IMPORT_STATUSES.has(value.status)&&
    validNonNegativeInteger(value.row_count)&&
    validNonNegativeInteger(value.error_count)&&
    validNullableTimestamp(value.validated_at)&&
    validNullableTimestamp(value.committed_at)&&
    validTimestamp(value.created_at)&&
    validTimestamp(value.updated_at);
}

function validImportValidate(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.import_id)&&
    (value.status==='validated'||value.status==='invalid')&&
    Number.isInteger(value.row_count)&&value.row_count>=1&&
    validNonNegativeInteger(value.error_count)&&
    ((value.status==='validated'&&value.error_count===0)||
     (value.status==='invalid'&&value.error_count>0));
}

function validImportCommit(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.import_id)&&value.status==='committed'&&
    Number.isInteger(value.committed_rows)&&value.committed_rows>=1&&
    typeof value.already_committed==='boolean';
}

function validateRpcShape(name,data){
  if(name==='dpp_api_import_create') return validImportCreate(data);
  if(name==='dpp_api_import_get') return validImportGet(data);
  if(name==='dpp_api_import_validate') return validImportValidate(data);
  if(name==='dpp_api_import_commit') return validImportCommit(data);
  if(name==='dpp_api_import_mapping_list') return Array.isArray(data)&&data.every(validMappingProfile);
  if(name==='dpp_api_import_mapping_save') return validMappingProfile(data);
  if(name==='dpp_api_import_mapping_delete') return validMappingDelete(data);
  return true;
}

function validRows(rows){
  if(!Array.isArray(rows)||rows.length<1||rows.length>1000) return false;
  return rows.every(row=>
    row&&typeof row==='object'&&!Array.isArray(row)&&
    row.normalized_model&&typeof row.normalized_model==='object'&&!Array.isArray(row.normalized_model)&&
    row.normalized_item&&typeof row.normalized_item==='object'&&!Array.isArray(row.normalized_item)&&
    (row.validation_errors==null||Array.isArray(row.validation_errors))
  );
}

function validMappingName(value){
  return typeof value==='string'&&value.trim().length>=1&&value.trim().length<=160;
}
function validMappingFormat(value){return value==='csv'||value==='xlsx';}
function validMappingHeaders(value){
  return Array.isArray(value)&&value.length>=1&&value.length<=100&&
    value.every(v=>typeof v==='string'&&v.trim().length>0)&&
    new Set(value.map(v=>v.trim().toLowerCase())).size===value.length;
}
function validFieldMapping(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.entries(value).every(([k,v])=>k.trim().length>0&&typeof v==='string');
}
function validMappingProfile(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.id)&&validMappingName(value.name)&&validMappingFormat(value.source_format)&&
    validMappingHeaders(value.source_headers)&&validFieldMapping(value.field_mapping)&&
    Number.isInteger(value.revision)&&value.revision>=1&&
    validTimestamp(value.created_at)&&validTimestamp(value.updated_at);
}
function validMappingDelete(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.id)&&value.deleted===true;
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('imports',data);
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

async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const {base,key}=getSupabaseConfig(env);

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
      if(response.ok) throw upstreamInvalidJsonError();
      data=null;
    }
  }catch(error){
    if(controller.signal.aborted||error&&error.name==='AbortError') throw upstreamTimeoutError();
    if(error&&error.publicCode) throw error;
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
  if(!validateRpcShape(name,data)) throw upstreamInvalidJsonError();
  return data;
}

async function handler(req,res){
  startRequestObservability(req,res,'imports');
  const rateLimit=enforceRateLimit(req,res,'imports');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());
  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }
  const sharedRateLimit=await enforceSharedRateLimit(req,res,'imports',authorization);
  if(sharedRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!sharedRateLimit.allowed) return send(res,429,rateLimitBody());


  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST','PATCH'].includes(method)){
    res.setHeader('Allow','GET, POST, PATCH');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  let body={};
  if(method!=='GET'){
    try{body=parseBody(req);}
    catch(error){
      const response=bodyErrorResponse(error);
      return send(res,response.status,response.body);
    }
  }

  try{
    if(method==='GET'){
      if(String(req.query&&req.query.mappings||'')==='1'){
        const value=await rpc('dpp_api_import_mapping_list',{},authorization);
        return send(res,200,{data:value});
      }
      const id=req.query&&req.query.id;
      if(!validUuid(id)){
        return send(res,400,{error:{code:'INVALID_IMPORT_ID',message:'A valid import UUID is required.'}});
      }
      const value=await rpc('dpp_api_import_get',{p_import_id:id},authorization);
      return send(res,200,{data:value});
    }

    if(method==='POST'){
      if(body.action==='save_mapping'){
        if(body.id!=null&&!validUuid(body.id)){
          return send(res,422,{error:{code:'INVALID_IMPORT_PAYLOAD',message:'The import mapping payload is invalid.'}});
        }
        if(!validMappingName(body.name)||!validMappingFormat(body.source_format)||!validMappingHeaders(body.source_headers)||!validFieldMapping(body.field_mapping)){
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
      }
      if(!validRows(body.rows)){
        return send(res,422,{error:{code:'INVALID_IMPORT_PAYLOAD',message:'The import payload is invalid.'}});
      }
      if(body.mapping_id!=null&&!validUuid(body.mapping_id)){
        return send(res,422,{error:{code:'INVALID_IMPORT_PAYLOAD',message:'The import payload is invalid.'}});
      }
      const value=await rpc('dpp_api_import_create',{
        p_rows:body.rows,
        p_mapping_id:body.mapping_id==null?null:body.mapping_id
      },authorization);
      return send(res,201,{data:value});
    }

    const id=body.id||(req.query&&req.query.id);
    const action=body.action;
    if(action==='delete_mapping'){
      if(!validUuid(id)){
        return send(res,400,{error:{code:'INVALID_IMPORT_MAPPING_ID',message:'A valid mapping UUID is required.'}});
      }
      const value=await rpc('dpp_api_import_mapping_delete',{p_id:id},authorization);
      return send(res,200,{data:value});
    }
    if(!validUuid(id)){
      return send(res,400,{error:{code:'INVALID_IMPORT_ID',message:'A valid import UUID is required.'}});
    }
    if(!['validate','commit'].includes(action)){
      return send(res,422,{error:{code:'INVALID_IMPORT_ACTION',message:'action must be validate, commit, or delete_mapping.'}});
    }

    const rpcName=action==='validate'?'dpp_api_import_validate':'dpp_api_import_commit';
    const value=await rpc(rpcName,{p_import_id:id},authorization);
    return send(res,200,{data:value});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=error.publicMessage||(status===500?'Server configuration is incomplete.':
      status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={bearer,validUuid,validTimestamp,validNullableTimestamp,validNonNegativeInteger,validImportCreate,validImportGet,validImportValidate,validImportCommit,validMappingName,validMappingFormat,validMappingHeaders,validFieldMapping,validMappingProfile,validMappingDelete,validateRpcShape,validRows,mapDatabaseError,rpc,IMPORT_STATUSES,DEFAULT_RPC_TIMEOUT_MS};
