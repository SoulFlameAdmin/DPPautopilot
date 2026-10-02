'use strict';

const DEFAULT_RPC_TIMEOUT_MS=8000;
const SOURCES=new Set(['qr','nfc','unknown']);

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
function upstreamError(status,code,message){
  const error=new Error(code);
  error.status=status;error.publicCode=code;error.publicMessage=message;
  return error;
}
function mapDbError(data){
  const code=data&&data.code;
  if(code==='DP402')return [404,'PASSPORT_NOT_FOUND','Active public passport was not found.'];
  if(code==='DP705')return [404,'CARRIER_NOT_FOUND','Active physical carrier was not found.'];
  if(code==='DP401'||code==='DP701')return [400,'INVALID_REQUEST','The carrier request is invalid.'];
  return [502,'UPSTREAM_ERROR','Database request failed.'];
}
async function rpc(payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key)throw upstreamError(500,'SERVER_CONFIGURATION_MISSING','Server configuration is incomplete.');
  const headers={apikey:key,'Content-Type':'application/json',Accept:'application/json'};
  if(authorization)headers.Authorization=authorization;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    let response;
    try{
      response=await fetchImpl(base.replace(/\/$/,'')+'/rest/v1/rpc/dpp_api_carrier_open',{
        method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal
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
async function handler(req,res){
  if(String(req.method||'GET').toUpperCase()!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const identifier=req.query&&req.query.identifier;
  const source=(req.query&&req.query.source)||'unknown';
  if(typeof identifier!=='string'||identifier.trim().length<1||identifier.trim().length>300||!SOURCES.has(source)){
    return send(res,400,{error:{code:'INVALID_REQUEST',message:'A valid identifier and source are required.'}});
  }
  try{
    const data=await rpc({p_unique_identifier:identifier.trim(),p_source:source},bearer(req));
    return send(res,200,{data});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    return send(res,status,{error:{code:error.publicCode||'UPSTREAM_ERROR',message:error.publicMessage||'Database request failed.'}});
  }
}
module.exports=handler;
module.exports._test={bearer,mapDbError,rpc,SOURCES,DEFAULT_RPC_TIMEOUT_MS};
