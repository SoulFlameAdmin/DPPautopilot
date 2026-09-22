'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

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

function ndjsonPackageRequested(req){
  const value=req&&req.query&&req.query.format;
  return typeof value==='string'&&value.toLowerCase()==='ndjson';
}

function sendNdjsonPackage(res,output){
  const source=output&&typeof output==='object'?output:{};
  const objects=Array.isArray(source.evidence_objects)?source.evidence_objects:[];
  const evidenceExport=source.evidence_export&&typeof source.evidence_export==='object'
    ?source.evidence_export
    :{
      included:false,
      object_count:0,
      total_bytes:0,
      integrity:'not_requested',
      encoding:null,
      manifest_object_count:Array.isArray(source.evidence_manifest)?source.evidence_manifest.length:0,
      manifest_sha256:evidenceManifestSha256(source.evidence_manifest||[]),
      paged:false,
      offset:0,
      limit:null,
      has_more:false,
      next_offset:null
    };
  const {evidence_objects:_objects,evidence_export:_export,...bundle}=source;
  const header={
    type:'dpp_export_header',
    package_version:'ndjson-v1',
    evidence_export:evidenceExport
  };
  const trailer={
    type:'dpp_export_end',
    package_version:'ndjson-v1',
    object_count:objects.length,
    total_bytes:objects.reduce((sum,item)=>sum+(Number(item&&item.byte_size)||0),0),
    integrity:evidenceExport.integrity||null,
    manifest_sha256:evidenceExport.manifest_sha256||null
  };
  const records=[
    header,
    {type:'dpp_bundle',package_version:'ndjson-v1',data:bundle},
    ...objects.map(item=>({type:'dpp_evidence',package_version:'ndjson-v1',data:item})),
    trailer
  ];
  res.statusCode=200;
  res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Disposition','attachment; filename="dpp-export.ndjson"');
  for(const record of records){
    const line=JSON.stringify(record)+'\n';
    if(typeof res.write==='function') res.write(line);
    else if(typeof res.body==='string') res.body+=line;
  }
  return res.end();
}

function exportError(code,status,message){
  const error=new Error(code);
  error.status=status;
  error.publicCode=code;
  error.publicMessage=message;
  return error;
}

function canonicalEvidenceManifest(manifest){
  return (Array.isArray(manifest)?manifest:[])
    .slice()
    .sort((a,b)=>{
      const ak=String(a&&a.storage_path||'')+'|'+String(a&&a.id||'');
      const bk=String(b&&b.storage_path||'')+'|'+String(b&&b.id||'');
      return ak<bk?-1:ak>bk?1:0;
    });
}

function evidenceManifestSha256(manifest){
  const canonical=canonicalEvidenceManifest(manifest).map(item=>({
    id:item&&item.id||null,
    storage_path:item&&item.storage_path||null,
    byte_size:Number(item&&item.byte_size)||0,
    sha256_hex:typeof (item&&item.sha256_hex)==='string'?item.sha256_hex.toLowerCase():''
  }));
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

function responseContentLength(response){
  if(!response||!response.headers||typeof response.headers.get!=='function') return null;
  const value=response.headers.get('content-length');
  if(value===null||value===undefined||value==='') return null;
  const normalized=String(value).trim();
  return /^(0|[1-9]\d*)$/.test(normalized)?Number(normalized):Number.NaN;
}

async function inlineEvidenceBytes(bundle,authorization,env=process.env,fetchImpl=fetch,page={paged:false,offset:0,limit:null}){
  const manifest=canonicalEvidenceManifest(bundle&&bundle.evidence_manifest);
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
    const declaredSize=Number(item.byte_size);
    const actualContentLength=responseContentLength(response);
    if(
      actualContentLength!==null&&(
        !Number.isInteger(declaredSize)||
        !Number.isSafeInteger(actualContentLength)||
        actualContentLength!==declaredSize
      )
    ){
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


async function* responseBodyChunks(response){
  if(response&&response.body&&typeof response.body.getReader==='function'){
    const reader=response.body.getReader();
    try{
      while(true){
        const part=await reader.read();
        if(part.done) break;
        if(part.value&&part.value.byteLength) yield Buffer.from(part.value);
      }
    }finally{
      if(typeof reader.releaseLock==='function') reader.releaseLock();
    }
    return;
  }
  yield Buffer.from(await response.arrayBuffer());
}

function ndjsonEvidencePrefix(item){
  const base={
    type:'dpp_evidence',
    package_version:'ndjson-v1',
    data:{
      id:item.id,
      storage_path:item.storage_path,
      original_filename:item.original_filename,
      content_type:item.content_type,
      byte_size:Number(item.byte_size),
      sha256_hex:typeof item.sha256_hex==='string'?item.sha256_hex.toLowerCase():'',
      encoding:'base64'
    }
  };
  const json=JSON.stringify(base);
  return json.slice(0,-2)+',"content_base64":"';
}

async function writeBase64VerifiedSpool(response,item,fileHandle){
  const declaredSize=Number(item&&item.byte_size);
  const declaredHash=typeof (item&&item.sha256_hex)==='string'?item.sha256_hex.toLowerCase():'';
  const hash=crypto.createHash('sha256');
  let byteSize=0;
  let carry=Buffer.alloc(0);
  await fileHandle.write(ndjsonEvidencePrefix(item));
  for await (const incoming of responseBodyChunks(response)){
    const chunk=Buffer.isBuffer(incoming)?incoming:Buffer.from(incoming);
    byteSize+=chunk.byteLength;
    if(byteSize>MAX_INLINE_EVIDENCE_BYTES){
      throw exportError('EVIDENCE_EXPORT_TOO_LARGE',413,'Evidence bytes exceed the inline export limit.');
    }
    hash.update(chunk);
    const merged=carry.length?Buffer.concat([carry,chunk]):chunk;
    const complete=merged.length-(merged.length%3);
    if(complete>0) await fileHandle.write(merged.subarray(0,complete).toString('base64'));
    carry=complete<merged.length?Buffer.from(merged.subarray(complete)):Buffer.alloc(0);
  }
  if(carry.length) await fileHandle.write(carry.toString('base64'));
  const sha256=hash.digest('hex');
  if(
    !Number.isInteger(declaredSize)||
    declaredSize!==byteSize||
    !/^[0-9a-f]{64}$/.test(declaredHash)||
    declaredHash!==sha256
  ){
    throw exportError('EVIDENCE_EXPORT_INTEGRITY_FAILED',502,'Evidence export integrity verification failed.');
  }
  await fileHandle.write('"}}\n');
  return {byteSize,sha256};
}

async function emitSpoolFile(res,filePath){
  for await (const chunk of fs.createReadStream(filePath)) res.write(chunk);
}

async function sendNdjsonSpoolPackage(res,bundle,authorization,env=process.env,fetchImpl=fetch,page={paged:false,offset:0,limit:null}){
  const manifest=canonicalEvidenceManifest(bundle&&bundle.evidence_manifest);
  const offset=page&&Number.isInteger(page.offset)?page.offset:0;
  const limit=page&&Number.isInteger(page.limit)?page.limit:null;
  const paged=Boolean(page&&page.paged);
  const manifestSha256=evidenceManifestSha256(manifest);
  const expectedManifestSha256=page&&page.expectedManifestSha256?page.expectedManifestSha256:null;
  const expectedManifestToken=page&&page.expectedManifestToken?page.expectedManifestToken:null;
  if(expectedManifestSha256&&expectedManifestSha256!==manifestSha256){
    throw exportError('EVIDENCE_EXPORT_MANIFEST_CHANGED',409,'Evidence export manifest changed; restart the export.');
  }
  if(expectedManifestToken) verifyEvidenceManifestToken(expectedManifestToken,manifestSha256,env);
  const signedMetadata=(page&&page.signedRequested)||expectedManifestToken
    ?{
      manifest_token:signEvidenceManifestToken(manifestSha256,env),
      manifest_signature_algorithm:'HMAC-SHA256-v1'
    }
    :{};
  const selected=paged?manifest.slice(offset,offset+limit):manifest;
  const declaredTotal=selected.reduce((sum,item)=>{
    const size=Number(item&&item.byte_size);
    return sum+(Number.isFinite(size)&&size>0?size:0);
  },0);
  if(declaredTotal>MAX_INLINE_EVIDENCE_BYTES){
    throw exportError('EVIDENCE_EXPORT_TOO_LARGE',413,'Evidence bytes exceed the inline export limit.');
  }

  const base=env.DPP_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.DPP_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  if(!base||!key) throw exportError('SERVER_CONFIGURATION_MISSING',500,'Server configuration is incomplete.');

  let tempDir=null;
  let actualTotal=0;
  const spoolFiles=[];
  try{
    tempDir=await fsp.mkdtemp(path.join(os.tmpdir(),'dpp-export-'));
    for(let index=0;index<selected.length;index+=1){
      const item=selected[index];
      const objectPath=typeof item.storage_path==='string'?item.storage_path:'';
      if(!objectPath){
        throw exportError('EVIDENCE_EXPORT_INTEGRITY_FAILED',502,'Evidence export integrity verification failed.');
      }
      const response=await fetchImpl(
        base.replace(/\/$/,'')+'/functions/v1/dpp-evidence-object?path='+encodeURIComponent(objectPath),
        {
          method:'GET',
          headers:{apikey:key,Authorization:authorization,Accept:'application/octet-stream'}
        }
      );
      if(!response.ok){
        throw exportError('EVIDENCE_EXPORT_OBJECT_UNAVAILABLE',502,'An evidence object could not be exported.');
      }
      const declaredContentType=typeof item.content_type==='string'?item.content_type.trim().toLowerCase():'';
      const actualContentType=responseContentType(response);
      if(actualContentType!==null&&(!declaredContentType||actualContentType!==declaredContentType)){
        throw exportError('EVIDENCE_EXPORT_INTEGRITY_FAILED',502,'Evidence export integrity verification failed.');
      }
      const declaredSize=Number(item.byte_size);
      const actualContentLength=responseContentLength(response);
      if(
        actualContentLength!==null&&(
          !Number.isInteger(declaredSize)||
          !Number.isSafeInteger(actualContentLength)||
          actualContentLength!==declaredSize
        )
      ){
        throw exportError('EVIDENCE_EXPORT_INTEGRITY_FAILED',502,'Evidence export integrity verification failed.');
      }
      const spoolPath=path.join(tempDir,String(index).padStart(4,'0')+'.ndjson');
      const fileHandle=await fsp.open(spoolPath,'wx');
      let verified;
      try{
        verified=await writeBase64VerifiedSpool(response,item,fileHandle);
      }finally{
        await fileHandle.close();
      }
      actualTotal+=verified.byteSize;
      if(actualTotal>MAX_INLINE_EVIDENCE_BYTES){
        throw exportError('EVIDENCE_EXPORT_TOO_LARGE',413,'Evidence bytes exceed the inline export limit.');
      }
      spoolFiles.push(spoolPath);
    }

    const evidenceExport={
      included:true,
      object_count:selected.length,
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
      next_offset:paged&&offset+selected.length<manifest.length?offset+selected.length:null,
      spool:'verified_tmpfile_v1'
    };
    const header={type:'dpp_export_header',package_version:'ndjson-v1',evidence_export:evidenceExport};
    const trailer={
      type:'dpp_export_end',
      package_version:'ndjson-v1',
      object_count:selected.length,
      total_bytes:actualTotal,
      integrity:'sha256_verified',
      manifest_sha256:manifestSha256
    };
    const headerLine=JSON.stringify(header)+'\n';
    const bundleLine=JSON.stringify({type:'dpp_bundle',package_version:'ndjson-v1',data:bundle})+'\n';
    const trailerLine=JSON.stringify(trailer)+'\n';
    let contentLength=Buffer.byteLength(headerLine)+Buffer.byteLength(bundleLine)+Buffer.byteLength(trailerLine);
    for(const spoolPath of spoolFiles){
      const stat=await fsp.stat(spoolPath);
      contentLength+=stat.size;
    }
    res.statusCode=200;
    res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Disposition','attachment; filename="dpp-export.ndjson"');
    res.setHeader('Content-Length',String(contentLength));
    res.write(headerLine);
    res.write(bundleLine);
    for(const spoolPath of spoolFiles) await emitSpoolFile(res,spoolPath);
    res.write(trailerLine);
    return res.end();
  }finally{
    if(tempDir) await fsp.rm(tempDir,{recursive:true,force:true}).catch(()=>{});
  }
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
    const ndjsonPackage=ndjsonPackageRequested(req);
    const includeEvidence=includeEvidenceRequested(req)||ndjsonPackage;
    const page=includeEvidence?evidencePageOptions(req):null;
    const bundle=await rpc(authorization);
    if(ndjsonPackage) return await sendNdjsonSpoolPackage(res,bundle,authorization,process.env,fetch,page);
    const output=includeEvidence
      ?await inlineEvidenceBytes(bundle,authorization,process.env,fetch,page)
      :bundle;
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
module.exports._test={bearer,mapDatabaseError,rpc,includeEvidenceRequested,ndjsonPackageRequested,sendNdjsonPackage,canonicalEvidenceManifest,evidenceManifestSha256,manifestSigningKey,signEvidenceManifestToken,verifyEvidenceManifestToken,evidencePageOptions,responseContentType,responseContentLength,responseBodyChunks,writeBase64VerifiedSpool,sendNdjsonSpoolPackage,inlineEvidenceBytes,MAX_INLINE_EVIDENCE_BYTES,MAX_EVIDENCE_PAGE_LIMIT,SIGNED_MANIFEST_VERSION};
