'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const m=require('../../api/_ai_document_intelligence.js');
const src={evidence_id:'00000000-0000-4000-8000-000000000123',sha256:'a'.repeat(64)};
const file=text=>({filename:'facts.csv',mime:'text/csv',bytes:Buffer.from(text)});
test('different claims stay unverified and flagged as a conflict',()=>{
const x=m.extractCsvDocument({source:src,file:file('company,country\nA,Bulgaria\nB,Bulgaria')});
assert.deepEqual(x.conflicted_fields,['company']);
assert.ok(x.candidates.every(y=>y.verified===false));
});
test('unrecognized headers never create manufactured facts',()=>{
const x=m.extractCsvDocument({source:src,file:file('sku,carbon footprint\nX,1')});
assert.equal(x.candidates.length,0);
});
test('CSV parser rejects invalid quoting',()=>{
assert.throws(()=>m.parseCsv('company\n"unfinished'),{code:'INVALID_CSV_QUOTING'});
});
test('semantic duplicate headings stop ambiguous imports',()=>{
assert.throws(()=>m.extractRows({source:src,rows:m.parseCsv('company,manufacturer\nA,B')}),
{code:'DUPLICATE_FIELD_HEADER'});
});
test('raw PDF requires a separate document decoder',()=>{
assert.throws(()=>m.extractCsvDocument({source:src,
file:{filename:'a.pdf',mime:'application/pdf',bytes:Buffer.from('%PDF-1.7')}}),
{code:'REQUIRES_SANDBOXED_DECODER'});
});
test('xlsx rows keep sheet and exact row references',()=>{
const x=m.extractRows({source:src,rows:[['country'],['Bulgaria']],format:'xlsx',sheet:'Sheet1'});
assert.deepEqual(x.candidates[0].source_anchor,{sheet:'Sheet1',row:2,column:1});
});

// Invisible Unicode prefixes and compatibility signs must not bypass the
// spreadsheet formula guard when the extracted value is later exported.
test('A3 blocks Unicode-disguised spreadsheet formulas in CSV cells',()=>{
 for(const value of ['\u200B=SUM(1)','\u2060+CMD','\uFF1D1+1','\u202E=SUM(A1)']){
  const out=m.extractCsvDocument({source:src,file:file('company\n'+value)});
  assert.equal(out.candidates.length,0,value);
  assert.equal(out.issues[0]?.code,'UNSAFE_OR_INVALID_CELL',value);
 }
});
test('A3 blocks invisible formula prefixes in decoded PDF pages',()=>{
 const out=m.extractPdfPages({source:src,pages:[{number:1,text:'Company: \u200B=1+1'}]});
 assert.equal(out.candidates.length,0);
 assert.equal(out.issues[0]?.code,'UNSAFE_OR_INVALID_CELL');
});
test('A3 continues accepting ordinary Cyrillic and Latin names',()=>{
 const out=m.extractCsvDocument({source:src,file:file('company\nСофия Батерии')});
 assert.equal(out.candidates[0]?.value,'София Батерии');
 assert.equal(out.candidates[0]?.verified,false);
});
