'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {uploadKind}=require('../../api/_ai_document_intelligence.js');
const {boundCsv}=require('../../api/_ai_document_evidence_binding.js');
const id='00000000-0000-4000-8000-000000000123';
const file={filename:'facts.csv',mime:'text/csv',bytes:Buffer.from('company\nAcme')};
const record={id,tenant_id:'00000000-0000-4000-8000-000000000124',
 scan_status:'clean',sha256:uploadKind(file).sha256,size_bytes:file.bytes.length,
 filename:file.filename,mime_type:file.mime};
test('document binding keeps sources linked to file digest',()=>{
 const r=boundCsv({file,trustedRecord:record});
 assert.equal(r.candidates[0].source_ref,'evidence:'+id);
 assert.equal(r.candidates[0].verified,false);
});
