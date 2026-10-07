'use strict';

const { getSupabaseConfig } = require('./_supabase_config.js');
const { mapDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const QUESTION_KEYS = new Set([
  'onboardingQ1','onboardingQ2','onboardingQ3','onboardingQ4',
  'onboardingQ5','onboardingQ6','onboardingQ7','onboardingQ8'
]);
const DEFAULT_RPC_TIMEOUT_MS = 8000;

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
function plainObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
function validUuid(value){
  return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validTimestamp(value){return typeof value==='string'&&value.trim().length>0&&Number.isFinite(Date.parse(value))}
function validAnswer(value){
  return plainObject(value)&&validUuid(value.organization_id)&&QUESTION_KEYS.has(value.question_key)&&
    validUuid(value.user_id)&&typeof value.raw_answer==='string'&&value.raw_answer.trim().length>=1&&
    value.raw_answer.length<=5000&&plainObject(value.structured_value)&&validTimestamp(value.updated_at);
}
function validState(value){
  return plainObject(value)&&validUuid(value.organization_id)&&validUuid(value.user_id)&&
    Number.isInteger(value.answered_count)&&value.answered_count>=0&&value.answered_count<=8&&
    typeof value.complete==='boolean'&&Array.isArray(value.answers)&&value.answers.every(answer=>
      plainObject(answer)&&QUESTION_KEYS.has(answer.question_key)&&typeof answer.raw_answer==='string'&&
      plainObject(answer.structured_value)&&validUuid(answer.user_id)&&validTimestamp(answer.updated_at)
    )&&(value.configuration===null||plainObject(value.configuration));
}
function validConfigure(value){
  if(!plainObject(value)||!validUuid(value.organization_id)||value.status!=='configured'||
     !Number.isInteger(value.revision)||value.revision<1||!validTimestamp(value.configured_at)||!Array.isArray(value.steps))return false;
  const expected=['company','workflow','product','batch','dpp','qr','ready'];
  if(value.steps.length!==expected.length)return false;
  return value.steps.every((step,index)=>plainObject(step)&&step.key===expected[index]&&step.status==='done');
}
function validateAnswerBody(body){
  if(!plainObject(body)||body.action!=='answer')return 'action';
  if(!QUESTION_KEYS.has(body.question_key))return 'question_key';
  if(typeof body.raw_answer!=='string'||body.raw_answer.trim().length<1||body.raw_answer.trim().length>5000)return 'raw_answer';
  if(body.structured_value!=null&&!plainObject(body.structured_value))return 'structured_value';
  return null;
}
function upstreamShapeError(){
  const error=new Error('UPSTREAM_ERROR');
  error.status=502;error.publicCode='UPSTREAM_ERROR';error.publicMessage='Database request failed.';
  return error;
}
function timeoutError(){
  const error=new Error('UPSTREAM_TIMEOUT');
  error.status=504;error.publicCode='UPSTREAM_TIMEOUT';error.publicMessage='Database request timed out.';
  return error;
}
async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const {base,key}=getSupabaseConfig(env);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response,data=null;
  try{
    response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload||{}),
      signal:controller.signal
    });
    try{data=await response.json()}catch(error){
      if(controller.signal.aborted||error?.name==='AbortError')throw timeoutError();
      if(response.ok)throw upstreamShapeError();
    }
  }catch(error){
    if(error?.publicCode)throw error;
    if(controller.signal.aborted||error?.name==='AbortError')throw timeoutError();
    throw upstreamShapeError();
  }finally{clearTimeout(timer)}

  if(!response.ok){
    const mapped=mapDatabaseError('manufacturer-onboarding',data);
    const error=new Error(mapped.code);
    error.status=mapped.status;error.publicCode=mapped.code;error.publicMessage=mapped.message;
    throw error;
  }
  if(name==='dpp_api_manufacturer_onboarding_answer_upsert'&&!validAnswer(data))throw upstreamShapeError();
  if(name==='dpp_api_manufacturer_onboarding_get'&&!validState(data))throw upstreamShapeError();
  if(name==='dpp_api_manufacturer_onboarding_configure'&&!validConfigure(data))throw upstreamShapeError();
  return data;
}
function errorResponse(res,error){
  const status=Number.isInteger(error.status)?error.status:502;
  const code=error.publicCode||error.message||'UPSTREAM_ERROR';
  const message=error.publicMessage||(status>=500?'Database request failed.':'The request failed.');
  return send(res,status,{error:{code,message}});
}

async function handler(req,res){
  startRequestObservability(req,res,'manufacturer-onboarding');
  const local=enforceRateLimit(req,res,'manufacturer-onboarding');
  if(!local.allowed)return send(res,429,rateLimitBody());

  const authorization=bearer(req);
  if(!authorization)return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  const shared=await enforceSharedRateLimit(req,res,'manufacturer-onboarding',authorization);
  if(shared.error)return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed)return send(res,429,rateLimitBody());

  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method)){
    res.setHeader('Allow','GET, POST');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  try{
    if(method==='GET'){
      const state=await rpc('dpp_api_manufacturer_onboarding_get',{},authorization);
      return send(res,200,{data:state});
    }

    let body;
    try{body=parseBody(req)}catch(error){
      const response=bodyErrorResponse(error);
      return send(res,response.status,response.body);
    }

    if(body.action==='answer'){
      const problem=validateAnswerBody(body);
      if(problem)return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      const answer=await rpc('dpp_api_manufacturer_onboarding_answer_upsert',{
        p_question_key:body.question_key,
        p_raw_answer:body.raw_answer.trim(),
        p_structured_value:body.structured_value||{}
      },authorization);
      return send(res,200,{data:answer});
    }

    if(body.action==='configure'){
      const configured=await rpc('dpp_api_manufacturer_onboarding_configure',{},authorization);
      return send(res,200,{data:configured});
    }

    return send(res,422,{error:{code:'VALIDATION_ERROR',message:'action must be answer or configure.'}});
  }catch(error){return errorResponse(res,error)}
}

module.exports=handler;
module.exports._test={
  QUESTION_KEYS,bearer,plainObject,validUuid,validTimestamp,validAnswer,validState,validConfigure,
  validateAnswerBody,rpc,DEFAULT_RPC_TIMEOUT_MS
};
