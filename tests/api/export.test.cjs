'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const handler=require('../../api/export.js');

function makeRes(){
  return {
    statusCode:0,headers:{},body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(value){this.body=value||'';}
  };
}
let requestSequence=0;
function makeReq(method='GET',auth='Bearer test-token',query={}){
  requestSequence+=1;
  const headers={'x-forwarded-for':`198.51.100.${requestSequence}`};
  if(auth) headers.authorization=auth;
  return {method,headers,query};
}
function withEnv(){
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-key';
  return ()=>{
    if(oldUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=oldKey;
  };
}

test('requires bearer auth before upstream access',async()=>{
  const original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(makeReq('GET',null),res);
    assert.equal(res.statusCode,401);
    assert.equal(JSON.parse(res.body).error.code,'AUTH_REQUIRED');
    assert.equal(called,false);
  }finally{global.fetch=original;}
});

test('GET forwards caller bearer to owner/admin export RPC',async()=>{
  const restore=withEnv(),original=global.fetch;
  let seen;
  global.fetch=async(url,options)=>{
    seen={url,options};
    return {ok:true,async json(){return {schema_version:1,organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',counts:{battery_models:1}};}};
  };
  try{
    const res=makeRes();
    await handler(makeReq(),res);
    assert.equal(res.statusCode,200);
    assert.equal(seen.url,'https://example.supabase.co/rest/v1/rpc/dpp_api_export_bundle');
    assert.equal(seen.options.headers.Authorization,'Bearer test-token');
    assert.equal(seen.options.headers.apikey,'anon-key');
    assert.equal(seen.options.body,'{}');
    assert.equal(res.headers['cache-control'],'no-store');
    assert.equal(res.headers['content-disposition'],'attachment; filename="dpp-export.json"');
    assert.equal(JSON.parse(res.body).data.schema_version,1);
  }finally{global.fetch=original;restore();}
});

test('RBAC denial maps to stable 403 without DB detail leak',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async()=>({ok:false,async json(){return {code:'DP104',message:'viewer role detail'};}});
  try{
    const res=makeRes();
    await handler(makeReq(),res);
    const payload=JSON.parse(res.body);
    assert.equal(res.statusCode,403);
    assert.equal(payload.error.code,'FORBIDDEN');
    assert.equal(res.body.includes('viewer role detail'),false);
  }finally{global.fetch=original;restore();}
});

test('missing server configuration fails closed',async()=>{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  try{
    const res=makeRes();
    await handler(makeReq(),res);
    assert.equal(res.statusCode,500);
    assert.equal(JSON.parse(res.body).error.code,'SERVER_CONFIGURATION_MISSING');
  }finally{
    if(oldUrl!==undefined) process.env.SUPABASE_URL=oldUrl;
    if(oldKey!==undefined) process.env.SUPABASE_ANON_KEY=oldKey;
  }
});

test('unsupported methods return 405',async()=>{
  const res=makeRes();
  await handler(makeReq('POST'),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET');
});


test('include_evidence downloads bytes through caller-JWT bridge and verifies integrity',async()=>{
  const restore=withEnv(),original=global.fetch;
  const bytes=Buffer.from('M21 evidence bytes','utf8');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const calls=[];
  global.fetch=async(url,options)=>{
    calls.push({url,options});
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {
        ok:true,
        async json(){return {
          schema_version:1,
          organization_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          evidence_manifest:[{
            id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/report.json',
            original_filename:'report.json',
            content_type:'application/json',
            byte_size:bytes.length,
            sha256_hex:sha256
          }]
        };}
      };
    }
    assert.equal(
      url,
      'https://example.supabase.co/functions/v1/dpp-evidence-object?path=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa%2Fevidence%2Freport.json'
    );
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer test-token');
    assert.equal(options.headers.apikey,'anon-key');
    return {
      ok:true,
      async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
    };
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{include_evidence:'1'}),res);
    assert.equal(res.statusCode,200);
    const payload=JSON.parse(res.body).data;
    assert.equal(payload.evidence_export.included,true);
    assert.equal(payload.evidence_export.object_count,1);
    assert.equal(payload.evidence_export.total_bytes,bytes.length);
    assert.equal(payload.evidence_export.integrity,'sha256_verified');
    assert.equal(payload.evidence_objects[0].content_base64,bytes.toString('base64'));
    assert.equal(payload.evidence_objects[0].sha256_hex,sha256);
    assert.equal(calls.length,2);
  }finally{global.fetch=original;restore();}
});

test('include_evidence fails closed on hash mismatch',async()=>{
  const restore=withEnv(),original=global.fetch;
  const bytes=Buffer.from('tampered','utf8');
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {
        ok:true,
        async json(){return {
          evidence_manifest:[{
            id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/report.json',
            original_filename:'report.json',
            content_type:'application/json',
            byte_size:bytes.length,
            sha256_hex:'0'.repeat(64)
          }]
        };}
      };
    }
    return {
      ok:true,
      async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
    };
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{include_evidence:'true'}),res);
    assert.equal(res.statusCode,502);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_INTEGRITY_FAILED');
    assert.equal(res.body.includes('tampered'),false);
  }finally{global.fetch=original;restore();}
});

test('include_evidence fails closed on content type mismatch before bytes are read',async()=>{
  const restore=withEnv(),original=global.fetch;
  const bytes=Buffer.from('content-type-check','utf8');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  let bytesRead=false;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {evidence_manifest:[{
        id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/report.json',
        original_filename:'report.json',content_type:'application/json',byte_size:bytes.length,sha256_hex:sha256
      }]};}};
    }
    return {ok:true,headers:{get(name){return String(name).toLowerCase()==='content-type'?'image/png':null;}},
      async arrayBuffer(){bytesRead=true;return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{include_evidence:'1'}),res);
    assert.equal(res.statusCode,502);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_INTEGRITY_FAILED');
    assert.equal(bytesRead,false);
  }finally{global.fetch=original;restore();}
});

test('include_evidence fails closed on content length mismatch before bytes are read',async()=>{
  const restore=withEnv(),original=global.fetch;
  const bytes=Buffer.from('content-length-check','utf8');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  let bytesRead=false;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {evidence_manifest:[{
        id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/report.bin',
        original_filename:'report.bin',content_type:'application/octet-stream',byte_size:bytes.length,sha256_hex:sha256
      }]};}};
    }
    return {ok:true,headers:{get(name){
      const key=String(name).toLowerCase();
      if(key==='content-type') return 'application/octet-stream';
      if(key==='content-length') return String(bytes.length+1);
      return null;
    }},async arrayBuffer(){bytesRead=true;return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer content-length-integrity-token',{include_evidence:'1'}),res);
    assert.equal(res.statusCode,502);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_INTEGRITY_FAILED');
    assert.equal(bytesRead,false);
  }finally{global.fetch=original;restore();}
});

test('include_evidence rejects declared total beyond inline memory limit before object download',async()=>{
  const restore=withEnv(),original=global.fetch;
  let objectCalls=0;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {
        ok:true,
        async json(){return {
          evidence_manifest:[{
            id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/large.pdf',
            original_filename:'large.pdf',
            content_type:'application/pdf',
            byte_size:handler._test.MAX_INLINE_EVIDENCE_BYTES+1,
            sha256_hex:'a'.repeat(64)
          }]
        };}
      };
    }
    objectCalls+=1;
    throw new Error('object fetch must not occur');
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{include_evidence:'1'}),res);
    assert.equal(res.statusCode,413);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_TOO_LARGE');
    assert.equal(objectCalls,0);
  }finally{global.fetch=original;restore();}
});

test('include_evidence maps unavailable object to stable export error',async()=>{
  const restore=withEnv(),original=global.fetch;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {
        ok:true,
        async json(){return {
          evidence_manifest:[{
            id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/missing.pdf',
            original_filename:'missing.pdf',
            content_type:'application/pdf',
            byte_size:5,
            sha256_hex:'a'.repeat(64)
          }]
        };}
      };
    }
    return {ok:false,status:404,async arrayBuffer(){return new ArrayBuffer(0);}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{include_evidence:'1'}),res);
    assert.equal(res.statusCode,502);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_OBJECT_UNAVAILABLE');
  }finally{global.fetch=original;restore();}
});


test('paged include_evidence fetches only selected manifest slice and exposes next_offset',async()=>{
  const restore=withEnv(),original=global.fetch;
  const bodies=[Buffer.from('one'),Buffer.from('two'),Buffer.from('three')];
  const manifest=bodies.map((bytes,i)=>({
    id:`00000000-0000-4000-8000-00000000000${i+1}`,
    storage_path:`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/file-${i+1}.bin`,
    original_filename:`file-${i+1}.bin`,
    content_type:'application/octet-stream',
    byte_size:bytes.length,
    sha256_hex:crypto.createHash('sha256').update(bytes).digest('hex')
  }));
  const objectPaths=[];
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {evidence_manifest:manifest};}};
    }
    const decoded=decodeURIComponent(String(url).split('path=')[1]||'');
    objectPaths.push(decoded);
    const index=Number(decoded.match(/file-(\d+)\.bin$/)?.[1]||0)-1;
    const bytes=bodies[index];
    return {ok:true,async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'1',
      evidence_limit:'1'
    }),res);
    assert.equal(res.statusCode,200);
    const data=JSON.parse(res.body).data;
    assert.equal(data.evidence_objects.length,1);
    assert.equal(data.evidence_objects[0].original_filename,'file-2.bin');
    assert.deepEqual(objectPaths,['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/file-2.bin']);
    assert.equal(data.evidence_export.manifest_object_count,3);
    assert.equal(data.evidence_export.paged,true);
    assert.equal(data.evidence_export.offset,1);
    assert.equal(data.evidence_export.limit,1);
    assert.equal(data.evidence_export.has_more,true);
    assert.equal(data.evidence_export.next_offset,2);
  }finally{global.fetch=original;restore();}
});

test('paged include_evidence validates pagination before export RPC',async()=>{
  const restore=withEnv(),original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'-1',
      evidence_limit:'1000'
    }),res);
    assert.equal(res.statusCode,400);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_PAGINATION_INVALID');
    assert.equal(called,false);
  }finally{global.fetch=original;restore();}
});

test('paged include_evidence ignores unselected oversized manifest objects',async()=>{
  const restore=withEnv(),original=global.fetch;
  const bytes=Buffer.from('small-page');
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  let objectCalls=0;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {evidence_manifest:[
        {
          id:'11111111-1111-4111-8111-111111111111',
          storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/huge.bin',
          original_filename:'huge.bin',
          content_type:'application/octet-stream',
          byte_size:handler._test.MAX_INLINE_EVIDENCE_BYTES+1,
          sha256_hex:'a'.repeat(64)
        },
        {
          id:'22222222-2222-4222-8222-222222222222',
          storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/small.bin',
          original_filename:'small.bin',
          content_type:'application/octet-stream',
          byte_size:bytes.length,
          sha256_hex:sha
        }
      ]};}};
    }
    objectCalls+=1;
    assert.ok(String(url).includes('small.bin'));
    return {ok:true,async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'1',
      evidence_limit:'1'
    }),res);
    assert.equal(res.statusCode,200);
    const data=JSON.parse(res.body).data;
    assert.equal(data.evidence_objects[0].original_filename,'small.bin');
    assert.equal(data.evidence_export.has_more,false);
    assert.equal(data.evidence_export.next_offset,null);
    assert.equal(objectCalls,1);
  }finally{global.fetch=original;restore();}
});


test('manifest consistency token allows deterministic resume and exposes stable digest',async()=>{
  const restore=withEnv(),original=global.fetch;
  const bodies=[Buffer.from('alpha'),Buffer.from('beta')];
  const manifest=bodies.map((bytes,i)=>({
    id:`00000000-0000-4000-8000-00000000000${i+1}`,
    storage_path:`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/resume-${i+1}.bin`,
    original_filename:`resume-${i+1}.bin`,
    content_type:'application/octet-stream',
    byte_size:bytes.length,
    sha256_hex:crypto.createHash('sha256').update(bytes).digest('hex')
  }));
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {evidence_manifest:manifest};}};
    }
    const decoded=decodeURIComponent(String(url).split('path=')[1]||'');
    const index=Number(decoded.match(/resume-(\d+)\.bin$/)?.[1]||0)-1;
    const bytes=bodies[index];
    return {ok:true,async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};
  };
  try{
    const first=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'0',
      evidence_limit:'1'
    }),first);
    assert.equal(first.statusCode,200);
    const firstData=JSON.parse(first.body).data;
    const manifestSha=firstData.evidence_export.manifest_sha256;
    assert.match(manifestSha,/^[0-9a-f]{64}$/);
    assert.equal(firstData.evidence_export.has_more,true);
    assert.equal(firstData.evidence_export.next_offset,1);

    const second=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'1',
      evidence_limit:'1',
      evidence_manifest_sha256:manifestSha
    }),second);
    assert.equal(second.statusCode,200);
    const secondData=JSON.parse(second.body).data;
    assert.equal(secondData.evidence_export.manifest_sha256,manifestSha);
    assert.equal(secondData.evidence_objects[0].original_filename,'resume-2.bin');
  }finally{global.fetch=original;restore();}
});

test('manifest consistency token fails closed on manifest drift before object fetch',async()=>{
  const restore=withEnv(),original=global.fetch;
  const bytes=Buffer.from('changed');
  let objectCalls=0;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {evidence_manifest:[{
        id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/changed.bin',
        original_filename:'changed.bin',
        content_type:'application/octet-stream',
        byte_size:bytes.length,
        sha256_hex:crypto.createHash('sha256').update(bytes).digest('hex')
      }]};}};
    }
    objectCalls+=1;
    throw new Error('object fetch must not occur on manifest drift');
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'0',
      evidence_limit:'1',
      evidence_manifest_sha256:'0'.repeat(64)
    }),res);
    assert.equal(res.statusCode,409);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_MANIFEST_CHANGED');
    assert.equal(objectCalls,0);
  }finally{global.fetch=original;restore();}
});

test('manifest consistency token validates digest shape before export RPC',async()=>{
  const restore=withEnv(),original=global.fetch;
  let called=false;
  global.fetch=async()=>{called=true;throw new Error('unexpected');};
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'0',
      evidence_limit:'1',
      evidence_manifest_sha256:'not-a-sha'
    }),res);
    assert.equal(res.statusCode,400);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_MANIFEST_INVALID');
    assert.equal(called,false);
  }finally{global.fetch=original;restore();}
});


test('signed manifest token supports deterministic paged resume',async()=>{
  const restore=withEnv(),original=global.fetch;
  const oldSigning=process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY;
  process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY='k'.repeat(64);
  const bytes1=Buffer.from('signed-page-one','utf8');
  const bytes2=Buffer.from('signed-page-two','utf8');
  const manifest=[
    {
      id:'11111111-1111-4111-8111-111111111111',
      storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/one.bin',
      original_filename:'one.bin',
      content_type:'application/octet-stream',
      byte_size:bytes1.length,
      sha256_hex:crypto.createHash('sha256').update(bytes1).digest('hex')
    },
    {
      id:'22222222-2222-4222-8222-222222222222',
      storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/two.bin',
      original_filename:'two.bin',
      content_type:'application/octet-stream',
      byte_size:bytes2.length,
      sha256_hex:crypto.createHash('sha256').update(bytes2).digest('hex')
    }
  ];
  let objectCalls=0;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {schema_version:1,evidence_manifest:manifest};}};
    }
    objectCalls+=1;
    const parsed=new URL(String(url));
    const path=parsed.searchParams.get('path');
    const bytes=path.endsWith('/one.bin')?bytes1:bytes2;
    return {
      ok:true,
      async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
    };
  };
  try{
    let res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'0',
      evidence_limit:'1',
      evidence_manifest_signed:'1'
    }),res);
    assert.equal(res.statusCode,200);
    const first=JSON.parse(res.body).data;
    assert.equal(first.evidence_export.manifest_signature_algorithm,'HMAC-SHA256-v1');
    assert.match(first.evidence_export.manifest_token,/^v1\.[0-9a-f]{64}\.[0-9a-f]{64}$/);
    assert.equal(first.evidence_export.next_offset,1);
    assert.equal(Buffer.from(first.evidence_objects[0].content_base64,'base64').toString('utf8'),'signed-page-one');

    res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:String(first.evidence_export.next_offset),
      evidence_limit:'1',
      evidence_manifest_token:first.evidence_export.manifest_token
    }),res);
    assert.equal(res.statusCode,200);
    const second=JSON.parse(res.body).data;
    assert.equal(second.evidence_export.manifest_token,first.evidence_export.manifest_token);
    assert.equal(second.evidence_export.next_offset,null);
    assert.equal(Buffer.from(second.evidence_objects[0].content_base64,'base64').toString('utf8'),'signed-page-two');
    assert.equal(objectCalls,2);
  }finally{
    global.fetch=original;
    restore();
    if(oldSigning===undefined) delete process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY;
    else process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY=oldSigning;
  }
});

test('signed manifest token rejects tampering before evidence object download',async()=>{
  const restore=withEnv(),original=global.fetch;
  const oldSigning=process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY;
  process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY='s'.repeat(64);
  const bytes=Buffer.from('signed-object','utf8');
  const manifest=[{
    id:'33333333-3333-4333-8333-333333333333',
    storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/signed.bin',
    original_filename:'signed.bin',
    content_type:'application/octet-stream',
    byte_size:bytes.length,
    sha256_hex:crypto.createHash('sha256').update(bytes).digest('hex')
  }];
  const digest=handler._test.evidenceManifestSha256(manifest);
  const valid=handler._test.signEvidenceManifestToken(digest,process.env);
  const last=valid.endsWith('0')?'1':'0';
  const tampered=valid.slice(0,-1)+last;
  let objectCalls=0;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {evidence_manifest:manifest};}};
    }
    objectCalls+=1;
    throw new Error('object fetch must not occur');
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'0',
      evidence_limit:'1',
      evidence_manifest_token:tampered
    }),res);
    assert.equal(res.statusCode,400);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_MANIFEST_TOKEN_INVALID');
    assert.equal(objectCalls,0);
  }finally{
    global.fetch=original;
    restore();
    if(oldSigning===undefined) delete process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY;
    else process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY=oldSigning;
  }
});

test('signed manifest request fails closed when signing key is unavailable',async()=>{
  const restore=withEnv(),original=global.fetch;
  const oldSigning=process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY;
  delete process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY;
  const bytes=Buffer.from('unsigned-object','utf8');
  const manifest=[{
    id:'44444444-4444-4444-8444-444444444444',
    storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/unsigned.bin',
    original_filename:'unsigned.bin',
    content_type:'application/octet-stream',
    byte_size:bytes.length,
    sha256_hex:crypto.createHash('sha256').update(bytes).digest('hex')
  }];
  let objectCalls=0;
  global.fetch=async(url)=>{
    if(String(url).includes('/rest/v1/rpc/dpp_api_export_bundle')){
      return {ok:true,async json(){return {evidence_manifest:manifest};}};
    }
    objectCalls+=1;
    throw new Error('object fetch must not occur');
  };
  try{
    const res=makeRes();
    await handler(makeReq('GET','Bearer test-token',{
      include_evidence:'1',
      evidence_offset:'0',
      evidence_limit:'1',
      evidence_manifest_signed:'1'
    }),res);
    assert.equal(res.statusCode,500);
    assert.equal(JSON.parse(res.body).error.code,'EVIDENCE_EXPORT_SIGNING_UNAVAILABLE');
    assert.equal(objectCalls,0);
  }finally{
    global.fetch=original;
    restore();
    if(oldSigning===undefined) delete process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY;
    else process.env.DPP_EXPORT_MANIFEST_SIGNING_KEY=oldSigning;
  }
});
