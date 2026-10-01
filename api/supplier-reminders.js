'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const SUBJECT_KINDS = new Set(['model','item','component','material']);
const CHANNELS = new Set(['email','portal','manual']);
const DELIVERY_STATUSES = new Set(['queued','sent','failed','cancelled']);

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

function validTimestamp(value){
  return typeof value==='string'&&value.trim().length>0&&Number.isFinite(Date.parse(value));
}

function validMissingFields(value){
  return Array.isArray(value)&&value.length>=1&&value.length<=500&&
    value.every(v=>typeof v==='string'&&v.trim().length>=1&&v.trim().length<=300);
}

function validReminder(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    validUuid(value.id)&&validUuid(value.supplier_id)&&
    SUBJECT_KINDS.has(value.subject_kind)&&
    typeof value.subject_ref==='string'&&value.subject_ref.trim().length>=1&&value.subject_ref.trim().length<=300&&
    validMissingFields(value.missing_fields)&&
    CHANNELS.has(value.channel)&&DELIVERY_STATUSES.has(value.delivery_status)&&
    validTimestamp(value.created_at);
}

function validateRpcShape(name,data){
  if(name==='dpp_api_supplier_reminders_list') return Array.isArray(data)&&data.every(validReminder);
  if(name==='dpp_api_supplier_reminder_create') return validReminder(data);
  return true;
}

function validateCreate(body){
  if(!validUuid(body.supplier_id)) return 'supplier_id must be a valid UUID';
  if(!SUBJECT_KINDS.has(body.subject_kind)) return 'unsupported subject_kind';
  if(typeof body.subject_ref!=='string'||body.subject_ref.trim().length<1||body.subject_ref.trim().length>300) return 'subject_ref must contain 1..300 characters';
  if(body.channel!=null&&!CHANNELS.has(body.channel)) return 'unsupported channel';
  return null;
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('supplier_reminders',data);
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
    try{data=await response.json();}
    catch(error){
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
  startRequestObservability(req,res,'supplier-reminders');
  const rateLimit=enforceRateLimit(req,res,'supplier-reminders');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());

  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }

  const sharedRateLimit=await enforceSharedRateLimit(req,res,'supplier-reminders',authorization);
  if(sharedRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!sharedRateLimit.allowed) return send(res,429,rateLimitBody());

  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method)){
    res.setHeader('Allow','GET, POST');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  let body={};
  if(method==='POST'){
    try{body=parseBody(req);}
    catch(error){
      const response=bodyErrorResponse(error);
      return send(res,response.status,response.body);
    }
  }

  try{
    if(method==='GET'){
      const supplierId=req.query&&req.query.supplier_id;
      if(supplierId!=null&&!validUuid(supplierId)){
        return send(res,400,{error:{code:'INVALID_SUPPLIER_ID',message:'A valid supplier UUID is required.'}});
      }
      const data=await rpc('dpp_api_supplier_reminders_list',{
        p_supplier_id:supplierId==null?null:supplierId
      },authorization);
      return send(res,200,{data});
    }

    const problem=validateCreate(body);
    if(problem){
      return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
    }

    const value=await rpc('dpp_api_supplier_reminder_create',{
      p_supplier_id:body.supplier_id,
      p_subject_kind:body.subject_kind,
      p_subject_ref:body.subject_ref.trim(),
      p_channel:body.channel||'email'
    },authorization);
    return send(res,201,{data:value});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=error.publicMessage||(status===500
      ?'Server configuration is incomplete.'
      :status>=500
        ?'Database request failed.'
        :code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={
  bearer,validUuid,validTimestamp,validMissingFields,validReminder,
  validateRpcShape,validateCreate,mapDatabaseError,rpc,DEFAULT_RPC_TIMEOUT_MS
};
