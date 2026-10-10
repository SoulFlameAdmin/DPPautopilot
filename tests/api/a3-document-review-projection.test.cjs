'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildDocumentReviewProjection:project}=require('../../api/_ai_document_review_projection.js');
const {extractCsvDocument,extractPdfPages}=require('../../api/_ai_document_intelligence.js');
const {buildIntakeState}=require('../../api/_ai_intake_contract.js');
const source={evidence_id:'00000000-0000-4000-8000-000000000123',sha256:'a'.repeat(64)};
const csv=text=>extractCsvDocument({
 file:{filename:'producer.csv',mime:'text/csv',bytes:Buffer.from(text)},
 source
});
const make=(value='Acme',extra={})=>({
 key:'company',value,verified:false,source_type:'document',
 source_ref:'evidence:'+source.evidence_id,source_digest:source.sha256,
 source_anchor:{row:2,column:1},...extra
});
test('actual CSV -> unverified facts, not approval or publication',()=>{
 const p=project({extraction:csv('company,country\nAcme,Bulgaria')});
 assert.equal(p.candidate_count,2);
 assert.equal(p.facts.company.value,'Acme');
 assert.equal(p.facts.country.verified,false);
 assert.equal(p.can_publish,false);
 assert.equal(p.can_generate_battery_passport,false);
 assert.equal(p.needs_human_review,true);
 const actual=buildIntakeState({module:'battery',mode:'manual',facts:p.facts});
 assert.equal(actual.status,'collecting');
 assert.deepEqual(actual.unverified_fields,['country','company']);
});
test('real CSV conflicting rows are quarantined not picked automatically',()=>{
 const p=project({extraction:csv('company\nAlpha\nBeta')});
 assert.deepEqual(p.conflicts,['company']);
 assert.equal(Object.hasOwn(p.facts,'company'),false);
 assert.deepEqual(p.question_plan_input.conflicts,['company']);
 assert.equal(p.choices.company.length,2);
 assert.equal(p.can_publish,false);
});
test('repeated identical claims remain unverified with each source preserved',()=>{
 const p=project({extraction:csv('company\nAcme\nACME')});
 assert.deepEqual(p.conflicts,[]);
 assert.equal(p.facts.company.verified,false);
 assert.equal(p.choices.company.length,2);
});
test('document with no recognized fields leaves all eight questions missing',()=>{
 const p=project({extraction:csv('unknown\nvalue')});
 assert.equal(p.candidate_count,0);
 assert.equal(p.missing_fields.length,8);
 assert.equal(Object.keys(p.facts).length,0);
});
test('PDF decoded candidates preserve page anchor for review',()=>{
 const p=project({extraction:extractPdfPages({source,pages:[{number:3,text:'Company: Компания ЕООД'}]})});
 assert.deepEqual(p.choices.company[0].source_anchor,{page:3,line:1});
 assert.equal(p.facts.company.verified,false);
});
test('reject attempted client verification or AI-as-document',()=>{
 assert.throws(()=>project({extraction:{candidates:[make('A',{verified:true})]}}),
  {code:'CANDIDATE_IS_NOT_UNVERIFIED_DOCUMENT'});
 assert.throws(()=>project({extraction:{candidates:[make('A',{source_type:'ai'})]}}),
  {code:'CANDIDATE_IS_NOT_UNVERIFIED_DOCUMENT'});
});
test('reject unknown fields and prototype-looking keys',()=>{
 for(const key of ['__proto__','carbonFootprint','constructor']){
  assert.throws(()=>project({extraction:{candidates:[make('A',{key})]}}),
   {code:'UNKNOWN_OR_INVALID_FIELD'});
 }
});
test('reject forged or incomplete document provenance',()=>{
 for(const change of [{source_ref:'https://invalid.example'},
  {source_digest:'abc'}, {source_anchor:{row:2}},
  {source_anchor:{page:1,line:1,extraneous:4}}]){
  assert.throws(()=>project({extraction:{candidates:[make('A',change)]}}));
 }
});
test('reject invalid document candidate and hidden formula values',()=>{
 for(const value of ['', '\u200B=1+1','\uFF1D1+1','\u202EAcme']){
  assert.throws(()=>project({extraction:{candidates:[make(value)]}}),
   {code:'UNSAFE_CANDIDATE_VALUE'});
 }
});
test('missing or excessively large extraction fails closed',()=>{
 assert.throws(()=>project(),{code:'INVALID_DOCUMENT_EXTRACTION'});
 assert.throws(()=>project({extraction:{candidates:new Array(1001).fill(make())}}),
   {code:'INVALID_DOCUMENT_EXTRACTION'});
});
test('review projections contain no fabricated PASS, publication or server auth',()=>{
 const p=project({extraction:{candidates:[make()]}});
 assert.equal(p.requires_server_authorization,true);
 assert.equal(p.requires_source_integrity_check,true);
 assert.equal(p.question_plan_input.facts.company.verified,false);
 assert.equal(p.can_publish,false);
});
