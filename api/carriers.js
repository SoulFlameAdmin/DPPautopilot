'use strict';

const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const KINDS=new Set(['qr','nfc']);
const NFC_TECH=new Set(['ntag213','ntag215','ntag216','ntag424_dna','other']);
const SOURCES=new Set(['qr','nfc','unknown']);
const DEFAULT_RPC_TIMEOUT_MS=8000;
const QR_UPSTREAM='https://api.qrserver.com/v1/create-qr-code/';
const QR_TIMEOUT_MS=6000;
const QR_MAX_BYTES=1024*1024;

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
function validPublicUrl(value){
  if(typeof value!=='string'||value.trim().length<1||value.trim().length>2048)return false;
  try{
    const url=new URL(value.trim());
    return url.protocol==='https:'||
      (url.protocol==='http:'&&(url.hostname==='localhost'||url.hostname==='127.0.0.1'));
  }catch{return false;}
}
function requestOrigin(req){
  const host=String((req.headers&&(req.headers['x-forwarded-host']||req.headers.host))||'').split(',')[0].trim();
  if(!host)return null;
  const proto=String((req.headers&&req.headers['x-forwarded-proto'])||'https').split(',')[0].trim();
  return proto+'://'+host;
}
function allowedQrTarget(raw,origin){
  if(typeof raw!=='string'||raw.length<1||raw.length>2048)return false;
  try{
    const target=new URL(raw);
    if(target.protocol!=='https:'&&!(target.protocol==='http:'&&(target.hostname==='localhost'||target.hostname==='127.0.0.1')))return false;
    if(target.hostname==='localhost'||target.hostname==='127.0.0.1')return true;
    return !!origin&&target.origin===origin;
  }catch{return false;}
}
function mapDbError(data){
  const code=data&&data.code;
  if(code==='DP104')return [403,'FORBIDDEN','The current role is not authorized.'];
  if(code==='DP706')return [404,'BATTERY_NOT_FOUND','Battery item was not found.'];
  if(code==='DP705')return [404,'CARRIER_NOT_FOUND','Active carrier was not found.'];
  if(code==='DP402')return [404,'PASSPORT_NOT_FOUND','Active public passport was not found.'];
  if(code==='DP401')return [400,'INVALID_REQUEST','The carrier request is invalid.'];
  if(['DP701','DP702','DP703','DP704'].includes(code))return [422,'VALIDATION_ERROR','The request failed validation.'];
  return [502,'UPSTREAM_ERROR','Database request failed.'];
}
function upstreamError(status,code,message){
  const error=new Error(code);
  error.status=status;
  error.publicCode=code;
  error.publicMessage=message;
  return error;
}
async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key)throw upstreamError(500,'SERVER_CONFIGURATION_MISSING','Server configuration is incomplete.');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const headers={apikey:key,'Content-Type':'application/json',Accept:'application/json'};
    if(authorization)headers.Authorization=authorization;
    let response;
    try{
      response=await fetchImpl(base.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{
        method:'POST',
        headers,
        body:JSON.stringify(payload||{}),
        signal:controller.signal
      });
    }catch(error){
      if(controller.signal.aborted||error?.name==='AbortError')throw upstreamError(504,'UPSTREAM_TIMEOUT','Database request timed out.');
      throw upstreamError(502,'UPSTREAM_ERROR','Database request failed.');
    }
    let data=null;
    try{data=await response.json();}
    catch(error){
      if(controller.signal.aborted||error?.name==='AbortError')throw upstreamError(504,'UPSTREAM_TIMEOUT','Database request timed out.');
      throw upstreamError(502,'UPSTREAM_ERROR','Database request failed.');
    }
    if(!response.ok){
      const [status,code,message]=mapDbError(data);
      throw upstreamError(status,code,message);
    }
    return data;
  }finally{clearTimeout(timer);}
}

async function sendQrImage(req,res,fetchImpl=fetch){
  const raw=req.query&&req.query.url;
  const origin=requestOrigin(req);
  if(!allowedQrTarget(raw,origin)){
    return send(res,400,{error:{code:'INVALID_QR_URL',message:'QR URL must be same-origin HTTPS or local test HTTP.'}});
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),QR_TIMEOUT_MS);
  try{
    const upstream=new URL(QR_UPSTREAM);
    upstream.searchParams.set('size','512x512');
    upstream.searchParams.set('format','png');
    upstream.searchParams.set('margin','12');
    upstream.searchParams.set('data',raw);

    let response;
    try{
      response=await fetchImpl(upstream,{signal:controller.signal,headers:{Accept:'image/png'}});
    }catch(error){
      if(controller.signal.aborted||error?.name==='AbortError')return send(res,504,{error:{code:'QR_TIMEOUT',message:'QR generation timed out.'}});
      return send(res,502,{error:{code:'QR_UPSTREAM_ERROR',message:'QR generation failed.'}});
    }
    if(!response.ok)return send(res,502,{error:{code:'QR_UPSTREAM_ERROR',message:'QR generation failed.'}});
    const contentType=String(response.headers?.get?.('content-type')||'');
    if(!contentType.toLowerCase().startsWith('image/png')){
      return send(res,502,{error:{code:'QR_UPSTREAM_ERROR',message:'QR generator returned an unexpected format.'}});
    }
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<32||bytes.length>QR_MAX_BYTES){
      return send(res,502,{error:{code:'QR_UPSTREAM_ERROR',message:'QR generator returned an invalid image.'}});
    }
    res.statusCode=200;
    res.setHeader('Content-Type','image/png');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.end(bytes);
  }finally{clearTimeout(timer);}
}

async function openPublicCarrier(req,res){
  const identifier=req.query&&req.query.identifier;
  const source=(req.query&&req.query.source)||'unknown';
  if(typeof identifier!=='string'||identifier.trim().length<1||identifier.trim().length>300||!SOURCES.has(source)){
    return send(res,400,{error:{code:'INVALID_REQUEST',message:'A valid identifier and source are required.'}});
  }
  try{
    const data=await rpc('dpp_api_carrier_open',{
      p_unique_identifier:identifier.trim(),
      p_source:source
    },bearer(req));
    return send(res,200,{data});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    return send(res,status,{error:{
      code:error.publicCode||'UPSTREAM_ERROR',
      message:error.publicMessage||'Database request failed.'
    }});
  }
}

async function handler(req,res){
  startRequestObservability(req,res,'carriers');
  const method=String(req.method||'GET').toUpperCase();
  const mode=method==='GET'&&req.query&&typeof req.query.mode==='string'?req.query.mode:'';
  const publicMode=mode==='open'||mode==='qr';
  const localRate=enforceRateLimit(
    req,res,'carriers',
    publicMode?{ruleName:'public_passport_read'}:{}
  );
  if(!localRate.allowed)return send(res,429,rateLimitBody());

  if(!['GET','POST','PATCH'].includes(method)){
    res.setHeader('Allow','GET, POST, PATCH');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  if(mode){
    if(method!=='GET')return send(res,400,{error:{code:'INVALID_REQUEST',message:'Carrier mode is GET-only.'}});
    if(mode==='open')return openPublicCarrier(req,res);
    if(mode==='qr')return sendQrImage(req,res);
    return send(res,400,{error:{code:'INVALID_MODE',message:'Unsupported carrier mode.'}});
  }

  const authorization=bearer(req);
  if(!authorization)return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  const shared=await enforceSharedRateLimit(req,res,'carriers',authorization);
  if(shared.error)return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed)return send(res,429,rateLimitBody());

  let body={};
  try{body=parseBody(req);}
  catch(error){const x=bodyErrorResponse(error);return send(res,x.status,x.body);}

  try{
    if(method==='GET'){
      const batteryId=req.query&&req.query.battery_item_id;
      if(batteryId!=null&&!validUuid(batteryId)){
        return send(res,400,{error:{code:'INVALID_BATTERY_ID',message:'A valid battery UUID is required.'}});
      }
      const data=await rpc('dpp_api_carriers_list',{p_battery_item_id:batteryId||null},authorization);
      return send(res,200,{data});
    }

    if(method==='POST'){
      if(!validUuid(body.battery_item_id)||!KINDS.has(body.carrier_kind)||!validPublicUrl(body.public_url)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      }
      const tech=body.nfc_technology==null?null:String(body.nfc_technology);
      if((body.carrier_kind==='nfc'&&!NFC_TECH.has(tech))||(body.carrier_kind==='qr'&&tech!==null)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      }
      if(body.external_uid!=null&&(typeof body.external_uid!=='string'||body.external_uid.trim().length<1||body.external_uid.trim().length>256)){
        return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      }
      const data=await rpc('dpp_api_carrier_bind',{
        p_battery_item_id:body.battery_item_id,
        p_carrier_kind:body.carrier_kind,
        p_public_url:body.public_url.trim(),
        p_nfc_technology:tech,
        p_external_uid:body.external_uid==null?null:body.external_uid.trim()
      },authorization);
      return send(res,201,{data});
    }

    if(!validUuid(body.id)){
      return send(res,400,{error:{code:'INVALID_CARRIER_ID',message:'A valid carrier UUID is required.'}});
    }
    const reason=typeof body.reason==='string'&&body.reason.trim()?body.reason.trim():'manual revoke';
    if(reason.length>300)return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
    const data=await rpc('dpp_api_carrier_revoke',{p_id:body.id,p_reason:reason},authorization);
    return send(res,200,{data});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    return send(res,status,{error:{
      code:error.publicCode||'UPSTREAM_ERROR',
      message:error.publicMessage||'Database request failed.'
    }});
  }
}

module.exports=handler;
module.exports._test={
  bearer,validUuid,validPublicUrl,requestOrigin,allowedQrTarget,mapDbError,rpc,
  sendQrImage,openPublicCarrier,KINDS,NFC_TECH,SOURCES,DEFAULT_RPC_TIMEOUT_MS,
  QR_UPSTREAM,QR_TIMEOUT_MS,QR_MAX_BYTES
};
