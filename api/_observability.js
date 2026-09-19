'use strict';

const crypto=require('node:crypto');

const REQUEST_ID_RE=/^[A-Za-z0-9._:-]{8,128}$/;
const ERROR_CODE_RE=/^[A-Z0-9_]{2,80}$/;

function header(req,name){
  if(!req||!req.headers) return '';
  const value=req.headers[name]??req.headers[name.toLowerCase()]??req.headers[name.toUpperCase()];
  if(Array.isArray(value)) return value[0]||'';
  return typeof value==='string'?value:'';
}

function selectRequestId(req){
  const candidate=header(req,'x-request-id').trim();
  return REQUEST_ID_RE.test(candidate)?candidate:crypto.randomUUID();
}

function authPresent(req){
  return /^Bearer\s+\S+$/i.test(header(req,'authorization'));
}

function errorCodeFromBody(status,chunk){
  if(status<400||typeof chunk!=='string'||chunk.length>65536) return null;
  try{
    const parsed=JSON.parse(chunk);
    const code=parsed&&parsed.error&&parsed.error.code;
    return typeof code==='string'&&ERROR_CODE_RE.test(code)?code:null;
  }catch(_){
    return null;
  }
}

function emit(logger,status,event){
  const line=JSON.stringify(event);
  if(status>=500&&logger&&typeof logger.error==='function') logger.error(line);
  else if(status>=400&&logger&&typeof logger.warn==='function') logger.warn(line);
  else if(logger&&typeof logger.info==='function') logger.info(line);
}

function startRequestObservability(req,res,surface,options={}){
  if(!res||typeof res.end!=='function') throw new Error('OBSERVABILITY_RESPONSE_REQUIRED');
  if(res.__dppObservabilityStarted) return res.__dppObservabilityContext;

  const logger=options.logger||console;
  const now=typeof options.now==='function'?options.now:Date.now;
  const requestId=selectRequestId(req);
  const startedAt=now();
  const originalEnd=res.end.bind(res);
  let finished=false;

  res.setHeader('X-Request-ID',requestId);

  const context={
    requestId,
    surface,
    method:String(req&&req.method||'GET').toUpperCase()
  };

  res.__dppObservabilityStarted=true;
  res.__dppObservabilityContext=context;

  res.end=function observedEnd(chunk,...args){
    if(!finished){
      finished=true;
      const status=Number.isInteger(res.statusCode)?res.statusCode:200;
      const event={
        event:'dpp_http_request',
        request_id:requestId,
        surface,
        method:context.method,
        status,
        outcome:status>=500?'server_error':status>=400?'client_error':'success',
        duration_ms:Math.max(0,Math.round(now()-startedAt)),
        auth_present:authPresent(req),
        error_code:errorCodeFromBody(status,chunk)
      };
      emit(logger,status,event);
    }
    return originalEnd(chunk,...args);
  };

  return context;
}

module.exports={
  startRequestObservability,
  _test:{header,selectRequestId,authPresent,errorCodeFromBody,REQUEST_ID_RE,ERROR_CODE_RE}
};
