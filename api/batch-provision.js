'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');
const { findRestrictedPublicPaths, findAuthorityOnlyPaths } = require('./_access_policy.js');
const PUBLIC = require('./_public_config.js');

const BATCH_KEY_RE=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_UNITS=250;

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
function plainObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function validTimestamp(value){return typeof value==='string'&&value.trim().length>0&&Number.isFinite(Date.parse(value));}
function normalizeIdentifier(value){
  if(typeof value!=='string')return null;
  const normalized=value.trim();
  if(!normalized||normalized.length>300||/[\u0000-\u001f\u007f]/.test(normalized))return null;
  return normalized;
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function canonicalOrigin(env=process.env){
  const value=String(env.DPP_PUBLIC_ORIGIN||PUBLIC.publicOrigin||'').trim();
  if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value))throw new Error('PUBLIC_ORIGIN_INVALID');
  return value.replace(/\/$/,'');
}
function validateUnit(unit){
  if(!plainObject(unit))return null;
  const identifier=normalizeIdentifier(unit.unique_identifier);
  if(!identifier)return null;
  const item=unit.item_canonical_data==null?{}:unit.item_canonical_data;
  const pub=unit.public_payload==null?{}:unit.public_payload;
  const priv=unit.private_payload==null?{}:unit.private_payload;
  if(!plainObject(item)||!plainObject(pub)||!plainObject(priv))return null;
  if(!plainObject(pub.item)||pub.item.unique_identifier!==identifier)return null;
  const category=pub.model&&pub.model.identification&&pub.model.identification.category;
  if(category!=null&&category!=='light_means_of_transport')return null;
  if(findRestrictedPublicPaths(pub).length)return null;
  if(findAuthorityOnlyPaths(priv).length)return {forbidden:true};
  return {unique_identifier:identifier,item_canonical_data:item,public_payload:pub,private_payload:priv};
}
function buildGeneratedUnits(generator,batchKey){
  if(!plainObject(generator))return null;
  const quantity=Number(generator.quantity);
  const start=Number(generator.serial_start);
  const width=Number(generator.serial_width);
  const prefix=typeof generator.identifier_prefix==='string'?generator.identifier_prefix.trim():'';
  const itemTemplate=generator.item_canonical_data_template==null?{}:generator.item_canonical_data_template;
  const pubTemplate=generator.public_payload_template==null?{}:generator.public_payload_template;
  const privTemplate=generator.private_payload_template==null?{}:generator.private_payload_template;
  if(!Number.isInteger(quantity)||quantity<1||quantity>MAX_UNITS)return null;
  if(!Number.isSafeInteger(start)||start<0)return null;
  if(!Number.isInteger(width)||width<1||width>12)return null;
  if(!prefix||prefix.length>250||/[\u0000-\u001f\u007f]/.test(prefix))return null;
  if(!plainObject(itemTemplate)||!plainObject(pubTemplate)||!plainObject(privTemplate))return null;
  const max=start+quantity-1;
  if(!Number.isSafeInteger(max)||String(max).length>width)return null;

  const units=[];
  for(let i=0;i<quantity;i++){
    const serial=start+i;
    const serialText=String(serial).padStart(width,'0');
    const identifier=normalizeIdentifier(prefix+serialText);
    if(!identifier)return null;
    const item=clone(itemTemplate);
    const production=plainObject(item.production)?item.production:{};
    item.production={...production,batch_key:batchKey,serial_number:serialText};
    const pub=clone(pubTemplate);
    pub.item=plainObject(pub.item)?pub.item:{};
    pub.item.unique_identifier=identifier;
    const priv=clone(privTemplate);
    units.push({unique_identifier:identifier,item_canonical_data:item,public_payload:pub,private_payload:priv});
  }
  return units;
}
function normalizeBody(body){
  if(!plainObject(body)||!validUuid(body.model_id))return {status:422,code:'VALIDATION_ERROR'};
  const batchKey=typeof body.batch_key==='string'?body.batch_key.trim():'';
  if(!BATCH_KEY_RE.test(batchKey))return {status:422,code:'VALIDATION_ERROR'};
  if(body.units!=null&&body.generator!=null)return {status:422,code:'VALIDATION_ERROR'};
  let rawUnits;
  if(body.units!=null){
    if(!Array.isArray(body.units)||body.units.length<1||body.units.length>MAX_UNITS)return {status:422,code:'VALIDATION_ERROR'};
    rawUnits=body.units;
  }else{
    rawUnits=buildGeneratedUnits(body.generator,batchKey);
    if(!rawUnits)return {status:422,code:'VALIDATION_ERROR'};
  }
  const units=[];
  const ids=new Set();
  for(const raw of rawUnits){
    const checked=validateUnit(raw);
    if(checked&&checked.forbidden)return {status:403,code:'FORBIDDEN'};
    if(!checked)return {status:422,code:'VALIDATION_ERROR'};
    if(ids.has(checked.unique_identifier))return {status:422,code:'VALIDATION_ERROR'};
    ids.add(checked.unique_identifier);
    units.push(checked);
  }
  return {model_id:body.model_id,batch_key:batchKey,units};
}
function validProvisionUnit(value){
  return plainObject(value)&&Number.isInteger(value.position)&&value.position>=1&&
    validUuid(value.item_id)&&validUuid(value.passport_id)&&validUuid(value.model_id)&&
    typeof value.unique_identifier==='string'&&value.unique_identifier.trim().length>=1&&value.unique_identifier.trim().length<=300&&
    value.lifecycle_status==='original'&&value.passport_status==='active'&&plainObject(value.public_payload)&&
    typeof value.created_item==='boolean'&&typeof value.created_passport==='boolean'&&typeof value.idempotent_replay==='boolean'&&
    validTimestamp(value.created_at)&&validTimestamp(value.updated_at);
}
function validBatchResult(value){
  return plainObject(value)&&validUuid(value.batch_id)&&validUuid(value.model_id)&&
    typeof value.batch_key==='string'&&BATCH_KEY_RE.test(value.batch_key)&&
    Number.isInteger(value.quantity)&&value.quantity>=1&&value.quantity<=MAX_UNITS&&
    typeof value.created_batch==='boolean'&&typeof value.idempotent_replay==='boolean'&&
    validTimestamp(value.created_at)&&Array.isArray(value.units)&&value.units.length===value.quantity&&
    value.units.every(validProvisionUnit);
}
function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('batch_provision',data);
  return [mapped.status,mapped.code,mapped.message];
}
const DEFAULT_RPC_TIMEOUT_MS=15000;
function upstreamTimeoutError(){
  const e=new Error('UPSTREAM_TIMEOUT');e.status=504;e.publicCode='UPSTREAM_TIMEOUT';e.publicMessage='Database request timed out.';return e;
}
function upstreamInvalidJsonError(){
  const e=new Error('UPSTREAM_ERROR');e.status=502;e.publicCode='UPSTREAM_ERROR';e.publicMessage='Database request failed.';return e;
}
async function rpc(payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL||PUBLIC.supabaseUrl;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||PUBLIC.supabasePublishableKey;
  if(!base||!key){const e=new Error('SERVER_CONFIGURATION_MISSING');e.status=500;throw e;}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let response,data=null;
  try{
    response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_api_scooter_battery_batch_provision`,{
      method:'POST',
      headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload),signal:controller.signal
    });
    try{data=await response.json();}catch(error){
      if(controller.signal.aborted||error&&error.name==='AbortError')throw upstreamTimeoutError();
      if(response.ok)throw upstreamInvalidJsonError();
    }
  }catch(error){
    if(controller.signal.aborted||error&&error.name==='AbortError')throw upstreamTimeoutError();
    if(error&&error.publicCode)throw error;
    throw upstreamInvalidJsonError();
  }finally{clearTimeout(timeout);}
  if(!response.ok){
    const [status,publicCode,publicMessage]=mapDatabaseError(data);
    const e=new Error(publicCode);e.status=status;e.publicCode=publicCode;e.publicMessage=publicMessage;throw e;
  }
  if(!validBatchResult(data))throw upstreamInvalidJsonError();
  return data;
}
async function handler(req,res){
  startRequestObservability(req,res,'batch_provision');
  const local=enforceRateLimit(req,res,'batch_provision');
  if(!local.allowed)return send(res,429,rateLimitBody());
  const method=String(req.method||'POST').toUpperCase();
  if(method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});}
  const authorization=bearer(req);
  if(!authorization)return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  const shared=await enforceSharedRateLimit(req,res,'batch_provision',authorization,{ruleName:'authenticated_write'});
  if(shared.error)return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed)return send(res,429,rateLimitBody());

  let body={};
  try{body=parseBody(req);}catch(error){const response=bodyErrorResponse(error);return send(res,response.status,response.body);}
  const checked=normalizeBody(body);
  if(checked.status){
    return send(res,checked.status,{error:{code:checked.code,message:checked.code==='FORBIDDEN'?'The request is not permitted.':'The request failed validation.'}});
  }
  try{
    const result=await rpc({p_model_id:checked.model_id,p_batch_key:checked.batch_key,p_units:checked.units},authorization);
    const origin=canonicalOrigin();
    const units=result.units.map(unit=>{
      const id=encodeURIComponent(unit.unique_identifier);
      return {...unit,passport_url:`${origin}/passport?identifier=${id}`,qr_url:`${origin}/qr?identifier=${id}`,qr_api_url:`${origin}/api/qr?identifier=${id}`};
    });
    return send(res,result.idempotent_replay?200:201,{data:{...result,units}});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=error.publicMessage||(status===500?'Server configuration is incomplete.':status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={
  BATCH_KEY_RE,MAX_UNITS,bearer,validUuid,plainObject,validTimestamp,normalizeIdentifier,
  canonicalOrigin,validateUnit,buildGeneratedUnits,normalizeBody,validProvisionUnit,validBatchResult,
  mapDatabaseError,rpc,DEFAULT_RPC_TIMEOUT_MS
};
