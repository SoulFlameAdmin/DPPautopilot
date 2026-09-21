'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const handler=require('../../api/export.js');

function manifestFor(bytes){
  return [{
    id:'55555555-5555-4555-8555-555555555555',
    storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence/length.bin',
    original_filename:'length.bin',
    content_type:'application/octet-stream',
    byte_size:bytes.length,
    sha256_hex:crypto.createHash('sha256').update(bytes).digest('hex')
  }];
}
function env(){
  return {SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-key'};
}

test('responseContentLength parses valid missing and malformed values',()=>{
  const make=value=>({headers:{get(name){
    return String(name).toLowerCase()==='content-length'?value:null;
  }}});
  assert.equal(handler._test.responseContentLength(make('42')),42);
  assert.equal(handler._test.responseContentLength(make(null)),null);
  assert.equal(Number.isNaN(handler._test.responseContentLength(make('42x'))),true);
});

test('evidence export rejects Content-Length mismatch before reading bytes',async()=>{
  const bytes=Buffer.from('length-integrity-check','utf8');
  let bytesRead=false;
  const fetchImpl=async()=>({
    ok:true,
    headers:{get(name){
      const key=String(name).toLowerCase();
      if(key==='content-type') return 'application/octet-stream';
      if(key==='content-length') return String(bytes.length+1);
      return null;
    }},
    async arrayBuffer(){
      bytesRead=true;
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    }
  });
  await assert.rejects(
    handler._test.inlineEvidenceBytes(
      {schema_version:1,evidence_manifest:manifestFor(bytes)},
      'Bearer test-token',env(),fetchImpl,{paged:false,offset:0,limit:null}
    ),
    error=>error&&error.publicCode==='EVIDENCE_EXPORT_INTEGRITY_FAILED'&&error.status===502
  );
  assert.equal(bytesRead,false);
});

test('evidence export accepts matching Content-Length and still verifies bytes/hash',async()=>{
  const bytes=Buffer.from('matching-length','utf8');
  const fetchImpl=async()=>({
    ok:true,
    headers:{get(name){
      const key=String(name).toLowerCase();
      if(key==='content-type') return 'application/octet-stream';
      if(key==='content-length') return String(bytes.length);
      return null;
    }},
    async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
  });
  const result=await handler._test.inlineEvidenceBytes(
    {schema_version:1,evidence_manifest:manifestFor(bytes)},
    'Bearer test-token',env(),fetchImpl,{paged:false,offset:0,limit:null}
  );
  assert.equal(result.evidence_export.object_count,1);
  assert.equal(result.evidence_export.total_bytes,bytes.length);
  assert.equal(Buffer.from(result.evidence_objects[0].content_base64,'base64').toString('utf8'),'matching-length');
});

test('evidence export rejects malformed Content-Length before reading bytes',async()=>{
  const bytes=Buffer.from('malformed-length','utf8');
  let bytesRead=false;
  const fetchImpl=async()=>({
    ok:true,
    headers:{get(name){
      const key=String(name).toLowerCase();
      if(key==='content-type') return 'application/octet-stream';
      if(key==='content-length') return 'not-a-number';
      return null;
    }},
    async arrayBuffer(){
      bytesRead=true;
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    }
  });
  await assert.rejects(
    handler._test.inlineEvidenceBytes(
      {schema_version:1,evidence_manifest:manifestFor(bytes)},
      'Bearer test-token',env(),fetchImpl,{paged:false,offset:0,limit:null}
    ),
    error=>error&&error.publicCode==='EVIDENCE_EXPORT_INTEGRITY_FAILED'&&error.status===502
  );
  assert.equal(bytesRead,false);
});
