'use strict';

const QR_UPSTREAM='https://api.qrserver.com/v1/create-qr-code/';
const TIMEOUT_MS=6000;
const MAX_BYTES=1024*1024;

function sendJson(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}
function requestOrigin(req){
  const host=String((req.headers&&(req.headers['x-forwarded-host']||req.headers.host))||'').split(',')[0].trim();
  if(!host)return null;
  const proto=String((req.headers&&req.headers['x-forwarded-proto'])||'https').split(',')[0].trim();
  return proto+'://'+host;
}
function allowedTarget(raw,origin){
  if(typeof raw!=='string'||raw.length<1||raw.length>2048)return false;
  try{
    const target=new URL(raw);
    if(target.protocol!=='https:'&&!(target.protocol==='http:'&&(target.hostname==='localhost'||target.hostname==='127.0.0.1')))return false;
    if(target.hostname==='localhost'||target.hostname==='127.0.0.1')return true;
    return !!origin&&target.origin===origin;
  }catch{return false;}
}
async function handler(req,res){
  if(String(req.method||'GET').toUpperCase()!=='GET'){
    res.setHeader('Allow','GET');
    return sendJson(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const raw=req.query&&req.query.url;
  const origin=requestOrigin(req);
  if(!allowedTarget(raw,origin)){
    return sendJson(res,400,{error:{code:'INVALID_QR_URL',message:'QR URL must be same-origin HTTPS or local test HTTP.'}});
  }

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const upstream=new URL(QR_UPSTREAM);
    upstream.searchParams.set('size','512x512');
    upstream.searchParams.set('format','png');
    upstream.searchParams.set('margin','12');
    upstream.searchParams.set('data',raw);

    let response;
    try{
      response=await fetch(upstream,{signal:controller.signal,headers:{Accept:'image/png'}});
    }catch(error){
      if(controller.signal.aborted||error?.name==='AbortError')return sendJson(res,504,{error:{code:'QR_TIMEOUT',message:'QR generation timed out.'}});
      return sendJson(res,502,{error:{code:'QR_UPSTREAM_ERROR',message:'QR generation failed.'}});
    }
    if(!response.ok)return sendJson(res,502,{error:{code:'QR_UPSTREAM_ERROR',message:'QR generation failed.'}});
    const contentType=String(response.headers?.get?.('content-type')||'');
    if(!contentType.toLowerCase().startsWith('image/png')){
      return sendJson(res,502,{error:{code:'QR_UPSTREAM_ERROR',message:'QR generator returned an unexpected format.'}});
    }
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<32||bytes.length>MAX_BYTES){
      return sendJson(res,502,{error:{code:'QR_UPSTREAM_ERROR',message:'QR generator returned an invalid image.'}});
    }
    res.statusCode=200;
    res.setHeader('Content-Type','image/png');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.end(bytes);
  }finally{
    clearTimeout(timer);
  }
}
module.exports=handler;
module.exports._test={requestOrigin,allowedTarget,QR_UPSTREAM,TIMEOUT_MS,MAX_BYTES};
