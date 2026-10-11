'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {questionPlan}=require('../../api/_ai_question_planner.js');
const {MODULES}=require('../../api/_ai_intake_contract.js');
const fact=(value,verified=true)=>({value,verified,source_type:'user',source_ref:'manual:input'});
const choice=(value,extra={})=>({
 value,verified:false,source_type:'document',
 source_ref:'evidence:00000000-0000-4000-8000-000000000123',
 source_digest:'a'.repeat(64),source_anchor:{row:2,column:1},...extra
});
test('real contract queues eight questions',()=>{
 const x=questionPlan();assert.equal(x.unresolved_count,8);
 assert.deepEqual(x.questions.map(q=>q.key),MODULES.battery.map(q=>q.key));
});
test('English translation and pagination',()=>{
 const x=questionPlan({language:'en',limit:1});
 assert.match(x.next_question.question,/country/);assert.equal(x.remaining_after_page,7);
});
test('human-review and publication boundary',()=>{
 const facts=Object.fromEntries(MODULES.battery.map(x=>[x.key,fact(x.key)]));
 const x=questionPlan({facts});assert.equal(x.unresolved_count,0);
 assert.equal(x.can_generate_battery_passport,false);assert.equal(x.can_publish,false);
});
test('conflicts outrank missing fields',()=>{
 const x=questionPlan({facts:{company:fact('Example')},conflicts:['company']});
 assert.equal(x.next_question.key,'company');assert.equal(x.next_question.reason,'conflict');
});
test('missing precedes unverified',()=>{
 const x=questionPlan({facts:{country:fact('BG',false)}});
 assert.equal(x.next_question.key,'company');assert.equal(x.questions.at(-1).key,'country');
});
test('A3 conflict choices survive into A4 human resolution without becoming verified',()=>{
 const choices={company:[choice('Alpha'),choice('Beta',{source_anchor:{row:3,column:1}})]};
 const x=questionPlan({conflicts:['company'],choices});
 assert.equal(x.next_question.key,'company');
 assert.deepEqual(x.next_question.allowed_actions,['choose','correct','reject']);
 assert.deepEqual(x.next_question.choices.map(v=>v.value),['Alpha','Beta']);
 assert.ok(x.next_question.choices.every(v=>v.verified===false));
 assert.equal(x.next_question.choices[0].source_digest,'a'.repeat(64));
 assert.deepEqual(x.next_question.choices[1].source_anchor,{row:3,column:1});
 assert.equal(x.review_choices_preserved,true);
 assert.equal(x.can_publish,false);
 assert.equal(x.can_generate_battery_passport,false);
});
test('unverified single candidate exposes review actions and provenance only as context',()=>{
 const x=questionPlan({
  facts:{country:fact('Bulgaria',false)},
  choices:{country:[choice('Bulgaria')]}
 });
 const q=x.questions.find(item=>item.key==='country');
 assert.equal(q.reason,'unverified');
 assert.deepEqual(q.allowed_actions,['confirm','correct','reject']);
 assert.equal(q.choices[0].source_ref,'evidence:00000000-0000-4000-8000-000000000123');
 assert.equal(q.choices[0].verified,false);
});
test('review choices fail closed on spoofed verification, unknown fields or malformed digest',()=>{
 assert.throws(()=>questionPlan({choices:{company:[choice('A',{verified:true})]}}),{code:'INVALID_CHOICES'});
 assert.throws(()=>questionPlan({choices:{notAField:[choice('A')]}}),{code:'INVALID_CHOICES'});
 assert.throws(()=>questionPlan({choices:{company:[choice('A',{source_digest:'abc'})]}}),{code:'INVALID_CHOICES'});
});
test('choice payload strips unrelated properties instead of reflecting them to review UI',()=>{
 const x=questionPlan({
  conflicts:['company'],
  choices:{company:[choice('Alpha',{secret:'must-not-reflect'})]}
 });
 assert.equal(Object.hasOwn(x.next_question.choices[0],'secret'),false);
});
