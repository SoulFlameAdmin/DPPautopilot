'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {questionPlan}=require('../../api/_ai_question_planner.js');
const {MODULES}=require('../../api/_ai_intake_contract.js');
const fact=(value,verified=true)=>({value,verified,source_type:'user',source_ref:'manual:input'});
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
