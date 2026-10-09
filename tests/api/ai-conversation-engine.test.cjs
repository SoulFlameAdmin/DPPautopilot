'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ConversationContractError,newConversationSession,applyConversationEvent,
  replayConversationEvents,conversationProjection}=require('../../api/_ai_conversation_engine.js');

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const TENANT=id(10), OWNER=id(11),SESSION=id(12),FIELD_KEYS=[
  'country','company','products','sku','annualVolume','users','systems','automation'];
const config={session_id:SESSION,tenant_id:TENANT};
function ev(revision,n,kind,fields={}) {
  return {event_id:id(n),expected_revision:revision,tenant_id:TENANT,actor_id:OWNER,
    occurred_at:'2026-10-09T18:45:00Z',kind,...fields};
}
function apply(state,n,kind,fields) {
  return applyConversationEvent(state,ev(state.revision,n,kind,fields));
}
function start() {
  return apply(newConversationSession(config),100,'message.add',
    {message:{id:id(101),role:'user',text:'We make e-bike batteries.'}});
}
function propose(s,n,field,value,source=id(101)) {
  return apply(s,n,'candidate.propose',{candidate:{id:id(n+1),field_key:field,
    value,source_type:'user',source_id:source}});
}
function complete() {
  let s=start();
  FIELD_KEYS.forEach((key,i)=>{
    const candidateId=id(201+i*2);
    s=apply(s,200+i*2,'candidate.propose',{candidate:{id:candidateId,
      field_key:key,value:'Evidence from user for '+key,source_type:'user',source_id:id(101)}});
    s=apply(s,300+i,'candidate.review',{candidate_id:candidateId,
      decision:'verified',reviewer_id:OWNER});
  });
  return s;
}
const errorCode=c=>e=>e instanceof ConversationContractError && e.code===c;

test('new session has eight questions; neither battery passport nor publication is ever authorized',()=>{
  const view=conversationProjection(newConversationSession(config));
  assert.equal(view.mode,'ai');
  assert.equal(view.questions.length,8);
  assert.deepEqual(view.missing_fields,FIELD_KEYS);
  assert.equal(view.can_generate_onboarding_configuration,false);
  assert.equal(view.can_generate_battery_passport,false);
  assert.equal(view.can_publish,false);
});
test('user-source candidate remains unverified and unverifiable AI text is not a source',()=>{
  let s=start();
  s=apply(s,110,'message.add',{message:{id:id(111),role:'assistant',text:'Guess: battery capacity 100kWh'}});
  assert.throws(()=>propose(s,112,'products','100kWh',id(111)),errorCode('SOURCE_NOT_FOUND'));
  assert.throws(()=>propose(s,113,'products','100kWh',id(777)),errorCode('SOURCE_NOT_FOUND'));
  s=propose(s,114,'products','e-bike batteries');
  assert.equal(conversationProjection(s).facts.products.verified,false);
  assert.deepEqual(conversationProjection(s).unverified_fields,['products']);
});
test('AI provenance, unsupported fields and directly preverified candidates are blocked',()=>{
  const s=start();
  const c={id:id(120),field_key:'products',value:'battery',source_id:id(101),source_type:'user'};
  assert.throws(()=>apply(s,122,'candidate.propose',{candidate:{...c,source_type:'ai'}}),
    errorCode('INVALID_CANDIDATE'));
  assert.throws(()=>apply(s,123,'candidate.propose',{candidate:{...c,field_key:'carbon_footprint'}}),
    errorCode('INVALID_CANDIDATE'));
  assert.throws(()=>apply(s,124,'candidate.propose',{candidate:{...c,verified:true}}),
    errorCode('INVALID_CANDIDATE'));
});
test('document candidate must link to previously registered evidence and page or row',()=>{
  let s=start();
  const candidate={id:id(131),field_key:'products',value:'48V pack',
    source_type:'document',source_id:id(130),anchor:{page:2}};
  assert.throws(()=>apply(s,132,'candidate.propose',{candidate}),errorCode('SOURCE_NOT_FOUND'));
  s=apply(s,133,'evidence.register',{evidence:{id:id(130),source_type:'document',
    reference:'private-bucket/item-130',name:'datasheet.pdf',mime_type:'application/pdf'}});
  assert.throws(()=>apply(s,134,'candidate.propose',{candidate:{...candidate,anchor:undefined}}),
    errorCode('MISSING_DOCUMENT_ANCHOR'));
  assert.throws(()=>apply(s,135,'candidate.propose',{candidate:{...candidate,anchor:{page:2,html:'<script>'}}}),
    errorCode('INVALID_SOURCE_ANCHOR'));
  s=apply(s,136,'candidate.propose',{candidate});
  const v=conversationProjection(s);
  assert.equal(v.source_anchors.products.page,2);
  assert.equal(v.facts.products.source_ref,'evidence:'+id(130));
  assert.equal(v.facts.products.verified,false);
});
test('conflicting values cannot be verified until alternative is rejected',()=>{
  let s=propose(propose(start(),140,'products','48V pack'),142,'products','72V pack');
  assert.deepEqual(conversationProjection(s).conflicted_fields,['products']);
  assert.equal(conversationProjection(s).questions.find(x=>x.key==='products').reason,'conflict');
  assert.throws(()=>apply(s,144,'candidate.review',{candidate_id:id(141),
    reviewer_id:OWNER,decision:'verified'}),errorCode('CONFLICT_REQUIRES_REVIEW'));
  s=apply(s,145,'candidate.review',{candidate_id:id(143),reviewer_id:OWNER,decision:'rejected'});
  s=apply(s,146,'candidate.review',{candidate_id:id(141),reviewer_id:OWNER,decision:'verified'});
  assert.equal(conversationProjection(s).facts.products.verified,true);
  assert.deepEqual(conversationProjection(s).conflicted_fields,[]);
});
test('human approval controls only onboarding configuration; battery DPP is still blocked',()=>{
  let s=complete(),v=conversationProjection(s);
  assert.equal(v.status,'review_required');
  assert.equal(v.can_generate_onboarding_configuration,false);
  assert.throws(()=>apply(s,400,'session.approve',{reviewer_id:id(999)}),
    errorCode('INVALID_REVIEWER'));
  s=apply(s,401,'session.approve',{reviewer_id:OWNER});
  v=conversationProjection(s);
  assert.equal(v.status,'ready_for_generation');
  assert.equal(v.can_generate_onboarding_configuration,true);
  assert.equal(v.can_generate_battery_passport,false);
  assert.equal(v.can_publish,false);
});
test('later user correction revokes fact-set approval and surfaces a conflict',()=>{
  let s=apply(complete(),410,'session.approve',{reviewer_id:OWNER});
  s=apply(s,411,'message.add',{message:{id:id(412),role:'user',text:'Correction: 13 SKUs'}});
  assert.equal(conversationProjection(s).status,'review_required');
  s=apply(s,413,'candidate.propose',{candidate:{id:id(414),field_key:'sku',
    value:'13 SKUs',source_type:'user',source_id:id(412)}});
  assert.deepEqual(conversationProjection(s).conflicted_fields,['sku']);
  assert.equal(conversationProjection(s).can_generate_onboarding_configuration,false);
});
test('switching AI/manual preserves values; publication remains forbidden',()=>{
  let s=complete(); const facts=conversationProjection(s).facts;
  s=apply(s,420,'session.mode',{mode:'manual'});
  s=apply(s,421,'session.mode',{mode:'ai'});
  assert.equal(conversationProjection(s).mode,'ai');
  assert.deepEqual(conversationProjection(s).facts,facts);
  assert.equal(conversationProjection(s).can_publish,false);
});
test('event UUID makes exact retries idempotent but stale updates and altered retry fail',()=>{
  const original=ev(0,430,'message.add',{message:{id:id(431),role:'user',text:'hello'}});
  const initial=newConversationSession(config);
  const advanced=applyConversationEvent(initial,original);
  assert.equal(initial.revision,0);
  assert.deepEqual(applyConversationEvent(advanced,original),advanced);
  assert.throws(()=>applyConversationEvent(advanced,{...original,kind:'session.mode',mode:'manual'}),
    errorCode('EVENT_ID_REUSED'));
  assert.throws(()=>applyConversationEvent(advanced,ev(0,432,'session.mode',{mode:'manual'})),
    errorCode('REVISION_CONFLICT'));
});
test('tenant separation is required at event boundary (Auth and RLS still required by backend)',()=>{
  const s=newConversationSession(config);
  assert.throws(()=>applyConversationEvent(s,{...ev(0,440,'session.mode',{mode:'manual'}),
    tenant_id:id(444)}),errorCode('TENANT_MISMATCH'));
});
test('pure replay recreates source-linked state and rejects incomplete approval',()=>{
  const e1=ev(0,450,'message.add',{message:{id:id(451),role:'user',text:'Battery products'}});
  const e2=ev(1,452,'candidate.propose',{candidate:{id:id(453),field_key:'products',
    value:'Battery products',source_type:'user',source_id:id(451)}});
  const e3=ev(2,454,'candidate.review',{candidate_id:id(453),reviewer_id:OWNER,
    decision:'verified'});
  const events=[e1,e2,e3];
  let s=newConversationSession(config);
  for(const e of events) s=applyConversationEvent(s,e);
  assert.deepEqual(replayConversationEvents(config,events),s);
  assert.throws(()=>apply(s,455,'session.approve',{reviewer_id:OWNER}),
    errorCode('INCOMPLETE_FACT_REVIEW'));
  assert.equal(conversationProjection(s).facts.products.verified,true);
});
