'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const m=require('../../api/_ai_document_intelligence.js');
const src={evidence_id:'00000000-0000-4000-8000-000000000123',sha256:'f'.repeat(64)};
const csv=s=>({filename:'producer.csv',mime:'text/csv',bytes:Buffer.from(s)});
test('CSV',()=>{
const out=m.extractCsvDocument({file:csv('company,products\nAcme,Battery'),source:src});
assert.equal(out.candidates.length,2);
assert.equal(out.candidates[0].verified,false);
assert.equal(out.candidates[0].source_anchor.row,2);
});
test('PDF decoder boundary',()=>{
const out=m.extractPdfPages({pages:[{number:1,text:'Company: Acme'}],source:src});
assert.equal(out.candidates.length,1);
assert.equal(out.candidates[0].source_anchor.page,1);
});
