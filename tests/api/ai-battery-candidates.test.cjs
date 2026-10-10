'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BatteryGPTError,allowedPoints,candidateSchema,buildGatewayBody,validateOutput,
 extractBatteryCandidates,getConfig}=require('../../api/_ai_lmt_candidate_extractor.js');
const live=require('../../data/lmt-battery-71-v2.json');
const safe=allowedPoints(live);
const goodPrompt='Model B123 is made by Acme Battery. Chemistry is NMC. Weight 5.4 kg; capacity 12 Ah. Manufactured 2026-09.';
const c=(point,value,evidence)=>({point,value,evidence});
const fail=(code)=>e=>e instanceof BatteryGPTError&&e.code===code;
function mockGateway(candidates,status=200){
 const calls=[];
 const fetchImpl=async(url,request)=>{
  calls.push({url,request});
  return {ok:status===200,status,json:async()=>({output_text:JSON.stringify({candidates})})};
 };
 return {fetchImpl,calls};
}
const run=(gateway,prompt=goodPrompt)=>extractBatteryCandidates({
 prompt,fetchImpl:gateway.fetchImpl,env:{AI_GATEWAY_API_KEY:'server-only-test-token'},matrix:live
});
test('actual 71-point LMT matrix allowlists exactly 20 public simple points',()=>{
 assert.equal(live.points.length,71);assert.equal(safe.length,20);
 assert.ok(safe.every(p=>p.access==='public'));
 assert.ok(safe.every(p=>['string','number','integer','month'].includes(p.valueType)));
});
test('restricted, authority, complex, enum, future points excluded',()=>{
 for(const n of [1,2,5,6,13,15,50,67,69,70,71])
  assert.ok(!safe.some(p=>p.number===n),'point '+n+' should not be eligible');
});
test('structured model schema is closed and bounded',()=>{
 const s=candidateSchema(safe);
 assert.equal(s.additionalProperties,false);
 assert.equal(s.properties.candidates.items.additionalProperties,false);
 assert.equal(s.properties.candidates.maxItems,12);
});
test('model instructions are bounded and preserve UNTRUSTED prompt classification',()=>{
 const body=buildGatewayBody(goodPrompt,'openai/gpt-5.6-sol',safe);
 assert.equal(body.text.format.strict,true);
 assert.match(body.instructions,/UNTRUSTED DATA/);
 assert.match(body.instructions,/Never claim publication/);
});
test('actual matrix public weight and capacity extraction remains unverified',async()=>{
 const mock=mockGateway([c(11,'12','capacity 12 Ah'),c(12,'NMC','Chemistry is NMC')]);
 const result=await run(mock);
 assert.equal(result.candidates.length,2);
 assert.equal(result.candidates[0].value,12);
 assert.equal(result.candidates[0].verified,false);
 assert.equal(result.candidates[1].verified,false);
 assert.equal(result.can_generate_battery_passport,false);
 assert.equal(result.can_publish,false);
 assert.equal(result.can_activate,false);
 assert.equal(result.compliance_assessed,false);
 assert.equal(result.matrix_total_points,71);
 assert.equal(mock.calls.length,1);
 assert.equal(mock.calls[0].request.headers.Authorization,'Bearer server-only-test-token');
 assert.ok(!JSON.stringify(result).includes('server-only-test-token'));
});
test('empty candidate set is non-READY and allowed',async()=>{
 const result=await run(mockGateway([]));
 assert.equal(result.candidate_count,0);
 assert.equal(result.needs_human_review,true);
});
test('private, authority, identifier, enum and nested outputs fail closed',()=>{
 for(const n of [1,2,5,6,13,50,67])
  assert.throws(()=>validateOutput({candidates:[c(n,'NMC','Chemistry is NMC')]},goodPrompt,safe,live.schemaVersion),fail('AI_OUTPUT_INVALID'));
});
test('unquoted facts fail closed',()=>{
 assert.throws(()=>validateOutput({candidates:[c(12,'LFP','Chemistry is NMC')]},goodPrompt,safe,live.schemaVersion),fail('AI_EVIDENCE_UNGROUNDED'));
});
test('fabricated quote fails closed',()=>{
 assert.throws(()=>validateOutput({candidates:[c(11,'12','capacity 12 amp-hour')]},goodPrompt,safe,live.schemaVersion),fail('AI_EVIDENCE_UNGROUNDED'));
});
test('numeric fact without explicit unit is rejected',()=>{
 assert.throws(()=>validateOutput({candidates:[c(11,'12','12')]},goodPrompt,safe,live.schemaVersion),fail('AI_EVIDENCE_UNIT_MISSING'));
});
test('numeric substrings from a larger integer are rejected',()=>{
 const prompt='Capacity 112 Ah';
 assert.throws(()=>validateOutput({candidates:[c(11,'12','112 Ah')]},prompt,safe,live.schemaVersion),fail('AI_EVIDENCE_UNGROUNDED'));
});
test('numeric evidence may contain two instances; valid standalone token allowed',()=>{
 const prompt='Readings: 112 and 12 Ah';
 const result=validateOutput({candidates:[c(11,'12',prompt)]},prompt,safe,live.schemaVersion);
 assert.equal(result.candidates[0].value,12);
});
test('no fabricated decimal precision',()=>{
 const prompt='Capacity 12 Ah';
 assert.throws(()=>validateOutput({candidates:[c(11,'12.0',prompt)]},prompt,safe,live.schemaVersion),fail('AI_EVIDENCE_UNGROUNDED'));
});
test('date is literal YYYY-MM, cannot normalize month names',()=>{
 const x=validateOutput({candidates:[c(9,'2026-09','Manufactured 2026-09')]},goodPrompt,safe,live.schemaVersion);
 assert.equal(x.candidates[0].value,'2026-09');
 assert.throws(()=>validateOutput({candidates:[c(9,'September 2026','Manufactured 2026-09')]},goodPrompt,safe,live.schemaVersion),fail('AI_EVIDENCE_UNGROUNDED'));
});
test('duplicate points rejected',()=>{
 assert.throws(()=>validateOutput({candidates:[c(12,'NMC','Chemistry is NMC'),c(12,'NMC','Chemistry is NMC')]},goodPrompt,safe,live.schemaVersion),fail('AI_OUTPUT_INVALID'));
});
test('client or model cannot assert verified=true in a candidate',()=>{
 assert.throws(()=>validateOutput({candidates:[{...c(12,'NMC','Chemistry is NMC'),verified:true}]},goodPrompt,safe,live.schemaVersion),fail('AI_OUTPUT_INVALID'));
});
test('output cannot claim can_publish status',()=>{
 assert.throws(()=>validateOutput({candidates:[],can_publish:true},goodPrompt,safe,live.schemaVersion),fail('AI_OUTPUT_INVALID'));
});
test('prompt maximum enforced before gateway call',async()=>{
 let called=false;
 await assert.rejects(extractBatteryCandidates({prompt:'x'.repeat(10001),matrix:live,env:{AI_GATEWAY_API_KEY:'token'},fetchImpl:async()=>{called=true;}}),fail('INVALID_PROMPT'));
 assert.equal(called,false);
});
test('server-side token required; no fallback to browser credentials',()=>{
 assert.throws(()=>getConfig({}),fail('AI_NOT_CONFIGURED'));
});
test('429 fails closed',async()=>{
 await assert.rejects(run(mockGateway([],429)),fail('AI_RATE_LIMITED'));
});
test('invalid JSON fails closed',async()=>{
 await assert.rejects(extractBatteryCandidates({prompt:goodPrompt,matrix:live,env:{AI_GATEWAY_API_KEY:'key'},fetchImpl:async()=>({ok:true,json:async()=>({output_text:'{not json}'})})}),fail('AI_OUTPUT_INVALID_JSON'));
});
test('invalid 71-point matrix cannot redefine allowed points',()=>{
 assert.throws(()=>allowedPoints({schemaVersion:'fake',points:live.points.slice(0,4)}),fail('INVALID_MATRIX'));
});
test('unknown numeric notation is rejected rather than changed',()=>{
 const prompt='Capacity 1e3 Ah';
 assert.throws(()=>validateOutput({candidates:[c(11,'1e3',prompt)]},prompt,safe,live.schemaVersion),fail('UNSUPPORTED_VALUE_FORMAT'));
});
