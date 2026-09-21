'use strict';

const crypto=require('node:crypto');

const { mapDatabaseError: mapSharedDatabaseError } = require('./_errors.js');
const { enforceRateLimit, enforceSharedRateLimit, sharedRateLimitUnavailableBody, rateLimitBody } = require('./_rate_limit.js');
const { startRequestObservability } = require('./_observability.js');

const MAX_INLINE_EVIDENCE_BYTES=25*1024*1024;
const MAX_EVIDENCE_PAGE_LIMIT=100;
const SIGNED_MANIFEST_VERSION='v1';

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Disposition','attachment; filename="dpp-export.json"');
  res.end(JSON.stringify(body));
}

function sendNdjson(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Disposition','attachment; filename="dpp-export.ndjson"');
  res.end(ndjsonEvidencePackage(body));
}

function bearer(req){
  const value=req.headers&&(req.headers.authorization||req.headers.Authorization);
  return typeof value==='string'&&/^Bearer\s+\S+$/i.test(value)?value:null;
}

function mapDatabaseError(data){
  const mapped=mapSharedDatabaseError('export',data);
  return [mapped.status,mapped.code,mapped.message];
}

async function rpc(authorization,env=process.env,fetchImpl=fetch){
  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key){
    const error=new Error('SERVER_CONFIGURATION_MISSING');
    error.status=500;
    throw error;
  }
  const response=await fetchImpl(`${base.replace(/\/$/,'')}/rest/v1/rpc/dpp_api_export_bundle`,{
    method:'POST',
    headers:{
      apikey:key,
      Authorization:authorization,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:'{}'
  });
  let data=null;
  try{data=await response.json();}catch(_){data=null;}
  if(!response.ok){
    const [status,publicCode,publicMessage]=mapDatabaseError(data);
    const error=new Error(publicCode);
    error.status=status;
    error.publicCode=publicCode;
    error.publicMessage=publicMessage;
    throw error;
  }
  return data;
}


function includeEvidenceRequested(req){
  const value=req&&req.query&&req.query.include_evidence;
  return value==='1'||value==='true'||value===true;
}

function evidencePackageFormat(req){
  const value=req&&req.query&&req.query.evidence_format;
  if(value===undefined||value===null||value==='') return 'json';
  const normalized=String(value).trim().toLowerCase();
  if(normalized==='json'||normalized==='ndjson') return normalized;
  throw exportError(
    'EVIDENCE_EXPORT_FORMAT_INVALID',
    400,
    'Evidence export format is invalid.'
  );
}

function ndjsonEvidencePackage(bundle){
  const source=bundle&&typeof bundle==='object'?bundle:{};
  const objects=Array.isArray(source.evidence_objects)?source.evidence_objects:[];
  const metadata={...source};
  delete metadata.evidence_objects;
  const lines=[JSON.stringify({type:'bundle',data:metadata})];
  for(const object of objects){
    lines.push(JSON.stringify({type:'evidence_object',data:object}));
  }
  return lines.join('\n')+'\n';
}

function exportError(code,status,message){
  const error=new Error(code);
  error.status=status;
  error.publicCode=code;
  error.publicMessage=message;
  return error;
}

function evidenceManifestSha256(manifest){
  const canonical=(Array.isArray(manifest)?manifest:[])
    .map(item=>({
      id:item&&item.id||null,
      storage_path:item&&item.storage_path||null,
      byte_size:Number(item&&item.byte_size)||0,
      sha256_hex:typeof (item&&item.sha256_hex)==='string'?item.sha256_hex.toLowerCase():''
    }))
    .sort((a,b)=>{
      const ak=String(a.storage_path||'')+'|'+String(a.id||'');
      const bk=String(b.storage_path||'')+'|'+String(b.id||'');
      return ak<bk?-1:ak>bk?1:0;
    });
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function manifestSigningKey(env=process.env){
  const raw=env&&env.DPP_EXPORT_MANIFEST_SIGNING_KEY;
  if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')<32){
    throw exportError(
      'EVIDENCE_EXPORT_SIGNING_UNAVAILABLE',
      500,
      'Evidence export signing configuration is unavailable.'
    );
  }
  return Buffer.from(raw,'utf8');
}

function signEvidenceManifestToken(manifestSha256,env=process.env){
  const signature=crypto
    .createHmac('sha256',manifestSigningKey(env))
    .update(`dpp-export-manifest:${SIGNED_MANIFEST_VERSION}:${manifestSha256}`)
    .digest('hex');
  return `${SIGNED_MANIFEST_VERSION}.${manifestSha256}.${signature}`;
}

function verifyEvidenceManifestToken(token,currentManifestSha256,env=process.env){
  const match=/^v1\.([0-9a-f]{64})\.([0-9a-f]{64})$/i.exec(String(token||''));
  if(!match){
    throw exportError(
      'EVIDENCE_EXPORT_MANIFEST_TOKEN_INVALID',
      400,
      'Evidence export signed manifest token is invalid.'
    );
  }
  const manifestSha256=match[1].toLowerCase();
  const providedSignature=match[2].toLowerCase();
  const expectedToken=signEvidenceManifestToken(manifestSha256,env);
  const expectedSignature=expectedToken.slice(expectedToken.lastIndexOf('.')+1);
  const signatureMatches=crypto.timingSafeEqual(
    Buffer.from(providedSignature,'hex'),
    Buffer.from(expectedSignature,'hex')
  );
  if(!signatureMatches){
    throw exportError(
      'EVIDENCE_EXPORT_MANIFEST_TOKEN_INVALID',
      400,
      'Evidence export signed manifest token is invalid.'
    );
  }
  if(manifestSha256!==currentManifestSha256){
    throw exportError(
      'EVIDENCE_EXPORT_MANIFEST_CHANGED',
      409,
      'Evidence export manifest changed; restart the export.'
    );
  }
  return manifestSha256;
}

function evidencePageOptions(req){
  const query=req&&req.query?req.query:{};
  const rawOffset=query.evidence_offset;
  const rawLimit=query.evidence_limit;
  const rawManifest=query.evidence_manifest_sha256;
  const rawManifestToken=query.evidence_manifest_token;
  const rawSigned=query.evidence_manifest_signed;
  const paged=rawOffset!==undefined||rawLimit!==undefined;
  const expectedManifestSha256=rawManifest===undefined||rawManifest===null||rawManifest===''
    ?null
    :String(rawManifest).toLowerCase();
  const expectedManifestToken=rawManifestToken===undefined||rawManifestToken===null||rawManifestToken===''
    ?null
    :String(rawManifestToken);
  const signedRequested=rawSigned==='1'||rawSigned==='true'||rawSigned===true||expectedManifestToken!==null;
  if(expectedManifestSha256!==null&&!/^[0-9a-f]{64}$/.test(expectedManifestSha256)){
    throw exportError(
      'EVIDENCE_EXPORT_MANIFEST_INVALID',
      400,
      'Evidence export manifest SHA-256 is invalid.'
    );
  }
  if(expectedManifestToken!==null&&!/^v1\.[0-9a-f]{64}\.[0-9a-f]{64}$/i.test(expectedManifestToken)){
    throw exportError(
      'EVIDENCE_EXPORT_MANIFEST_TOKEN_INVALID',
      400,
      'Evidence export signed manifest token is invalid.'
    );
  }
  if(!paged) return {paged:false,offset:0,limit:null,expectedManifestSha256,expectedManifestToken,signedRequested};

  const offset=rawOffset===undefined?0:Number(rawOffset);
  const limit=rawLimit===undefined?25:Number(rawLimit);
  if(
    !Number.isInteger(offset)||offset<0||
    !Number.isInteger(limit)||limit<1||limit>MAX_EVIDENCE_PAGE_LIMIT
  ){
    throw exportError(
      'EVIDENCE_EXPORT_PAGINATION_INVALID',
      400,
      'Evidence export pagination parameters are invalid.'
    );
  }
  return {paged:true,offset,limit,expectedManifestSha256,expectedManifestToken,signedRequested};
}

function responseContentType(response){
  if(!response||!response.headers||typeof response.headers.get!=='function') return null;
  const value=response.headers.get('content-type');
  return typeof value==='string'?value.split(';')[0].trim().toLowerCase():'';
}

async function inlineEvidenceBytes(bundle,authorization,env=process.env,fetchImpl=fetch,page={paged:false,offset:0,limit:null}){
  const manifest=Array.isArray(bundle&&bundle.evidence_manifest)?bundle.evidence_manifest:[];
  const offset=page&&Number.isInteger(page.offset)?page.offset:0;
  const limit=page&&Number.isInteger(page.limit)?page.limit:null;
  const paged=Boolean(page&&page.paged);
  const manifestSha256=evidenceManifestSha256(manifest);
  const expectedManifestSha256=page&&page.expectedManifestSha256?page.expectedManifestSha256:null;
  const expectedManifestToken=page&&page.expectedManifestToken?page.expectedManifestToken:null;
  if(expectedManifestSha256&&expectedManifestSha256!==manifestSha256){
    throw exportError(
      'EVIDENCE_EXPORT_MANIFEST_CHANGED',
      409,
      'Evidence export manifest changed; restart the export.'
    );
  }
  if(expectedManifestToken){
    verifyEvidenceManifestToken(expectedManifestToken,manifestSha256,env);
  }
  const signedMetadata=(page&&page.signedRequested)||expectedManifestToken
    ?{
      manifest_token:signEvidenceManifestToken(manifestSha256,env),
      manifest_signature_algorithm:'HMAC-SHA256-v1'
    }
    :{};
  const selected=paged?manifest.slice(offset,offset+limit):manifest;
  if(manifest.length===0||selected.length===0){
    return {
      ...bundle,
      evidence_objects:[],
      evidence_export:{
        included:true,
        object_count:0,
        total_bytes:0,
        integrity:'sha256_verified',
        encoding:'base64',
        inline_limit_bytes:MAX_INLINE_EVIDENCE_BYTES,
        manifest_object_count:manifest.length,
        manifest_sha256:manifestSha256,
        ...signedMetadata,
        paged,
        offset:paged?offset:0,
        limit:paged?limit:null,
        has_more:false,
        next_offset:null
      }
    };
  }

  const declaredTotal=selected.reduce((sum,item)=>{
    const size=Number(item&&item.byte_size);
    return sum+(Number.isFinite(size)&&size>0?size:0);
  },0);
  if(declaredTotal>MAX_INLINE_EVIDENCE_BYTES){
    throw exportError(
      'EVIDENCE_EXPORT_TOO_LARGE',
      413,
      'Evidence bytes exceed the inline export limit.'
    );
  }

  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key){
    throw exportError('SERVER_CONFIGURATION_MISSING',500,'Server configuration is incomplete.');
  }

  let actualTotal=0;
  const objects=[];
  for(const item of selected){
    const path=typeof item.storage_path==='string'?item.storage_path:'';
    if(!path){
      throw exportError(
        'EVIDENCE_EXPORT_INTEGRITY_FAILED',
        502,
        'Evidence export integrity verification failed.'
      );
    }
    const response=await fetchImpl(
      `${base.replace(/\/$/,'')}/functions/v1/dpp-evidence-object?path=${encodeURIComponent(path)}`,
      {
        method:'GET',
        headers:{
          apikey:key,
          Authorization:authorization,
          Accept:'application/octet-stream'
        }
      }
    );
    if(!response.ok){
      throw exportError(
        'EVIDENCE_EXPORT_OBJECT_UNAVAILABLE',
        502,
        'An evidence object could not be exported.'
      );
    }
    const declaredContentType=typeof item.content_type==='string'?item.content_type.trim().toLowerCase():'';
    const actualContentType=responseContentType(response);
    if(actualContentType!==null&&(!declaredContentType||actualContentType!==declaredContentType)){
      throw exportError('EVIDENCE_EXPORT_INTEGRITY_FAILED',502,'Evidence export integrity verification failed.');
    }
    const bytes=Buffer.from(await response.arrayBuffer());
    actualTotal+=bytes.byteLength;
    if(actualTotal>MAX_INLINE_EVIDENCE_BYTES){
      throw exportError(
        'EVIDENCE_EXPORT_TOO_LARGE',
        413,
        'Evidence bytes exceed the inline export limit.'
      );
    }
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const declaredSize=Number(item.byte_size);
    const declaredHash=typeof item.sha256_hex==='string'?item.sha256_hex.toLowerCase():'';
    if(
      !Number.isInteger(declaredSize)||
      declaredSize!==bytes.byteLength||
      !/^[0-9a-f]{64}$/.test(declaredHash)||
      declaredHash!==sha256
    ){
      throw exportError(
        'EVIDENCE_EXPORT_INTEGRITY_FAILED',
        502,
        'Evidence export integrity verification failed.'
      );
    }
    objects.push({
      id:item.id,
      storage_path:path,
      original_filename:item.original_filename,
      content_type:item.content_type,
      byte_size:bytes.byteLength,
      sha256_hex:sha256,
      encoding:'base64',
      content_base64:bytes.toString('base64')
    });
  }

  return {
    ...bundle,
    evidence_objects:objects,
    evidence_export:{
      included:true,
      object_count:objects.length,
      total_bytes:actualTotal,
      integrity:'sha256_verified',
      encoding:'base64',
      inline_limit_bytes:MAX_INLINE_EVIDENCE_BYTES,
      manifest_object_count:manifest.length,
      manifest_sha256:manifestSha256,
      ...signedMetadata,
      paged,
      offset:paged?offset:0,
      limit:paged?limit:null,
      has_more:paged?(offset+selected.length<manifest.length):false,
      next_offset:paged&&offset+selected.length<manifest.length?offset+selected.length:null
    }
  };
}

async function handler(req,res){
  startRequestObservability(req,res,'export');
  const rateLimit=enforceRateLimit(req,res,'export');
  if(!rateLimit.allowed) return send(res,429,rateLimitBody());
  const method=String(req.method||'GET').toUpperCase();
  if(method!=='GET'){
    res.setHeader('Allow','GET');
    return send(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}});
  }
  const authorization=bearer(req);
  if(!authorization){
    return send(res,401,{error:{code:'AUTH_REQUIRED',message:'Bearer authentication is required.'}});
  }
  const sharedRateLimit=await enforceSharedRateLimit(req,res,'export',authorization);
  if(sharedRateLimit.error) return send(res,503,sharedRateLimitUnavailableBody());
  if(!sharedRateLimit.allowed) return send(res,429,rateLimitBody());
  try{
    const includeEvidence=includeEvidenceRequested(req);
    const page=includeEvidence?evidencePageOptions(req):null;
    const format=includeEvidence?evidencePackageFormat(req):'json';
    const bundle=await rpc(authorization);
    const output=includeEvidence
      ?await inlineEvidenceBytes(bundle,authorization,process.env,fetch,page)
      :bundle;
    if(includeEvidence&&format==='ndjson') return sendNdjson(res,200,output);
    return send(res,200,{data:output});
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:502;
    const code=error.publicCode||error.message||'UPSTREAM_ERROR';
    const message=error.publicMessage||(status===500?'Server configuration is incomplete.':
      status>=500?'Database request failed.':code.replace(/_/g,' ').toLowerCase());
    return send(res,status,{error:{code,message}});
  }
}

module.exports=handler;
module.exports._test={bearer,mapDatabaseError,rpc,includeEvidenceRequested,evidencePackageFormat,ndjsonEvidencePackage,evidenceManifestSha256,manifestSigningKey,signEvidenceManifestToken,verifyEvidenceManifestToken,evidencePageOptions,responseContentType,inlineEvidenceBytes,MAX_INLINE_EVIDENCE_BYTES,MAX_EVIDENCE_PAGE_LIMIT,SIGNED_MANIFEST_VERSION};
