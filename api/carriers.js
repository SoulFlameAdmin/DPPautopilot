'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
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
function validKind(value){return value==='qr'||value==='nfc';}
function validNfcTechnology(value){
  return ['ntag213','ntag215','ntag216','ntag424_dna','other'].includes(value);
}
function validExternalUid(value){
  return value==null||(typeof value==='string'&&value.trim().length>=1&&value.trim().length<=256);
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
  }finally{clearTimeout(timer);}
  if(!response.ok){
    const mapped=mapSharedDatabaseError('carrier',data);
    throw upstreamError(mapped.code,mapped.message,mapped.status);
  }
  return data;
}

async function handler(req,res){
  startRequestObservability(req,res,'carrier');
  const local=enforceRateLimit(req,res,'carrier');
  if(!local.allowed)return send(res,429,rateLimitBody());
  const authorization=bearer(req);
  if(!authorization)return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST','PATCH'].includes(method)){
    res.setHeader('Allow','GET, POST, PATCH');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const shared=await enforceSharedRateLimit(req,res,'carrier',authorization,{ruleName:method==='GET'?'authenticated_read':'authenticated_write'});
  if(shared.error)return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed)return send(res,429,rateLimitBody());

  let body={};
  if(method!=='GET'){
    try{body=parseBody(req);}
    catch(error){const response=bodyErrorResponse(error);return send(res,response.status,response.body);}
  }

  try{
    if(method==='GET'){
      const itemId=req.query&&req.query.battery_item_id;
      if(itemId!=null&&itemId!==''&&!validUuid(itemId)){
        return send(res,400,{error:{code:'INVALID_ITEM_ID',message:'A valid item UUID is required.'}});
      }
      if(String(req.query&&req.query.history||'')==='1'){
        const limit=Number(req.query&&req.query.limit||100);
        if(!Number.isInteger(limit)||limit<1||limit>500){
          return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
        }
        const value=await rpc('dpp_api_carrier_scan_history',{p_battery_item_id:itemId||null,p_limit:limit},authorization);
        return send(res,200,{data:value});
      }
      const value=await rpc('dpp_api_carriers_list',{p_battery_item_id:itemId||null},authorization);
      return send(res,200,{data:value});
    }

    if(method==='POST'){
      if(!validUuid(body.battery_item_id)||!validKind(body.carrier_kind)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      }
      if(body.carrier_kind==='nfc'&&!validNfcTechnology(body.nfc_technology)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      }
      if(body.carrier_kind==='qr'&&body.nfc_technology!=null){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      }
      if(!validExternalUid(body.external_uid)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      }
      const value=await rpc('dpp_api_carrier_bind_secure',{
        p_battery_item_id:body.battery_item_id,
        p_carrier_kind:body.carrier_kind,
        p_nfc_technology:body.carrier_kind==='nfc'?body.nfc_technology:null,
        p_external_uid:body.external_uid==null?null:String(body.external_uid).trim()
      },authorization);
      return send(res,201,{data:value});
    }

    if(!validUuid(body.id)){
      return send(res,400,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
    }
    if(body.action!=='revoke'){
      return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
    }
    const reason=body.reason==null?'manual revoke':String(body.reason).trim();
    if(!reason||reason.length>500){
      return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
    }
    const value=await rpc('dpp_api_carrier_revoke',{p_id:body.id,p_reason:reason},authorization);
    return send(res,200,{data:value});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    return send(res,status,{error:{code:error.publicCode||'UPSTREAM_ERROR',message:error.publicMessage||'Database request failed.'}});
  }
}
module.exports=handler;
module.exports._test={bearer,validUuid,validKind,validNfcTechnology,validExternalUid,rpc,DEFAULT_RPC_TIMEOUT_MS};
