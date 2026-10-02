'use strict';

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { parseBody, bodyErrorResponse } = require('./_request.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const SUBJECT_KINDS=new Set(['model','item','component','material']);
const VERIFY_STATUSES=new Set(['validated','verified','rejected']);

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

function validNullableUuid(value){return value==null||validUuid(value);}
function validTimestamp(value){return typeof value==='string'&&value.trim()&&Number.isFinite(Date.parse(value));}
function validObject(value){return value&&typeof value==='object'&&!Array.isArray(value);}

function validSupplier(value){
  return validObject(value)&&validUuid(value.id)&&
    typeof value.external_ref==='string'&&value.external_ref.length>=1&&value.external_ref.length<=200&&
    typeof value.legal_name==='string'&&value.legal_name.length>=1&&value.legal_name.length<=250&&
    ['active','suspended','inactive'].includes(value.status)&&
    (value.package_count==null||Number.isInteger(value.package_count))&&
    (value.missing_count==null||Number.isInteger(value.missing_count))&&
    validTimestamp(value.created_at)&&validTimestamp(value.updated_at);
}

function validPackageResult(value){
  return validObject(value)&&validUuid(value.id)&&validUuid(value.supplier_id)&&
    SUBJECT_KINDS.has(value.subject_kind)&&
    typeof value.subject_ref==='string'&&value.subject_ref.length>=1&&value.subject_ref.length<=300&&
    validNullableUuid(value.model_id)&&validNullableUuid(value.item_id)&&
    (value.component_ref==null||typeof value.component_ref==='string')&&
    (value.material_ref==null||typeof value.material_ref==='string')&&
    value.verification_status==='unverified'&&
    validNullableUuid(value.supersedes_id)&&
    validTimestamp(value.source_date)&&validTimestamp(value.created_at);
}

function validVerificationResult(value){
  return validObject(value)&&validUuid(value.id)&&validUuid(value.package_id)&&
    VERIFY_STATUSES.has(value.status)&&
    typeof value.evidence_ref==='string'&&value.evidence_ref.length>=1&&
    (value.note==null||typeof value.note==='string')&&validTimestamp(value.recorded_at);
}

function validateRpcShape(name,data){
  if(name==='dpp_api_suppliers_list') return Array.isArray(data)&&data.every(validSupplier);
  if(name==='dpp_api_supplier_create') return validSupplier(data);
  if(name==='dpp_api_supplier_package_create') return validPackageResult(data);
  if(name==='dpp_api_supplier_package_verify') return validVerificationResult(data);
  return true;
}

function textRange(value,min,max){return typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max;}

function validateCreateSupplier(body){
  return textRange(body.external_ref,1,200)&&textRange(body.legal_name,1,250);
}

function validatePackage(body){
  if(!validUuid(body.supplier_id)||!SUBJECT_KINDS.has(body.subject_kind)||!textRange(body.subject_ref,1,300)) return false;
  if(!validObject(body.payload)||!validTimestamp(body.source_date)) return false;
  if(!validNullableUuid(body.model_id)||!validNullableUuid(body.item_id)||!validNullableUuid(body.supersedes_id)) return false;
  if(body.component_ref!=null&&!textRange(body.component_ref,1,200)) return false;
  if(body.material_ref!=null&&!textRange(body.material_ref,1,200)) return false;

  const model=body.model_id!=null;
  const item=body.item_id!=null;
  const component=body.component_ref!=null;
  const material=body.material_ref!=null;
  if(body.subject_kind==='model') return model&&!item&&!component&&!material;
  if(body.subject_kind==='item') return !model&&item&&!component&&!material;
  if(body.subject_kind==='component') return component&&!material&&(model!==item);
  if(body.subject_kind==='material') return material&&(model!==item);
  return false;
}

function validateVerification(body){
  return validUuid(body.package_id)&&VERIFY_STATUSES.has(body.status)&&
    textRange(body.evidence_ref,1,1000)&&
    (body.note==null||(typeof body.note==='string'&&body.note.length<=2000));
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('suppliers',data);
  return [mapped.status,mapped.code,mapped.message];
}

const DEFAULT_RPC_TIMEOUT_MS=8000;

function upstreamTimeoutError(){
  const error=new Error('UPSTREAM_TIMEOUT');
  error.status=504; error.publicCode='UPSTREAM_TIMEOUT'; error.publicMessage='Database request timed out.';
  return error;
}
function upstreamInvalidJsonError(){
  const error=new Error('UPSTREAM_ERROR');
  error.status=502; error.publicCode='UPSTREAM_ERROR'; error.publicMessage='Database request failed.';
  return error;
}

async function rpc(name,payload,authorization,env=process.env,fetchImpl=fetch,timeoutMs=DEFAULT_RPC_TIMEOUT_MS){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key){const error=new Error('SERVER_CONFIGURATION_MISSING');error.status=500;throw error;}
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let response; let data=null;
  try{
    response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',Accept:'application/json'},
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
  }finally{clearTimeout(timeout);}
  if(!response.ok){
    const [status,publicCode,publicMessage]=mapDatabaseError(data);
    const error=new Error(publicCode); error.status=status; error.publicCode=publicCode; error.publicMessage=publicMessage; throw error;
  }
  if(!validateRpcShape(name,data)) throw upstreamInvalidJsonError();
  return data;
}

async function handler(req,res){
  startRequestObservability(req,res,'suppliers');
  const local=enforceRateLimit(req,res,'suppliers');
  if(!local.allowed) return send(res,429,rateLimitBody());

  const authorization=bearer(req);
  if(!authorization) return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});

  const shared=await enforceSharedRateLimit(req,res,'suppliers',authorization);
  if(shared.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!shared.allowed) return send(res,429,rateLimitBody());

  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(method)){
    res.setHeader('Allow','GET, POST');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }

  let body={};
  if(method==='POST'){
    try{body=parseBody(req);}
    catch(error){const response=bodyErrorResponse(error);return send(res,response.status,response.body);}
  }

  try{
    if(method==='GET'){
      const data=await rpc('dpp_api_suppliers_list',{},authorization);
      return send(res,200,{data});
    }

    const action=body.action;
    if(action==='create_supplier'){
      if(!validateCreateSupplier(body)) return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      const data=await rpc('dpp_api_supplier_create',{
        p_external_ref:body.external_ref.trim(),
        p_legal_name:body.legal_name.trim()
      },authorization);
      return send(res,201,{data});
    }

    if(action==='create_package'){
      if(!validatePackage(body)) return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      const data=await rpc('dpp_api_supplier_package_create',{
        p_supplier_id:body.supplier_id,
        p_subject_kind:body.subject_kind,
        p_subject_ref:body.subject_ref.trim(),
        p_model_id:body.model_id==null?null:body.model_id,
        p_item_id:body.item_id==null?null:body.item_id,
        p_component_ref:body.component_ref==null?null:body.component_ref.trim(),
        p_material_ref:body.material_ref==null?null:body.material_ref.trim(),
        p_payload:body.payload,
        p_source_date:body.source_date,
        p_supersedes_id:body.supersedes_id==null?null:body.supersedes_id
      },authorization);
      return send(res,201,{data});
    }

    if(action==='verify_package'){
      if(!validateVerification(body)) return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
      const data=await rpc('dpp_api_supplier_package_verify',{
        p_package_id:body.package_id,
        p_status:body.status,
        p_evidence_ref:body.evidence_ref.trim(),
        p_note:body.note==null?null:body.note
      },authorization);
      return send(res,201,{data});
    }

    return send(res,422,{error:{code:'VALIDATION_ERROR',message:'The request failed validation.'}});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=error.publicMessage||(status===500?'Server configuration is incomplete.':status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={
  bearer,validUuid,validSupplier,validPackageResult,validVerificationResult,
  validateRpcShape,validateCreateSupplier,validatePackage,validateVerification,
  mapDatabaseError,rpc,DEFAULT_RPC_TIMEOUT_MS
};
