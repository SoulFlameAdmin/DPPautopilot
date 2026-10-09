'use strict';

/**
 * Pure, event-based AI conversation and evidence reducer (Worker A).
 * SECURITY: The caller must authenticate actor/tenant, enforce roles + RLS,
 * assign stable server IDs and persist events atomically with revision CAS.
 * No database writes, AI calls or publication happen in this module.
 * Scope is the eight manufacturer onboarding fields, NOT Annex XIII Battery DPP.
 */
const { createHash } = require('node:crypto');
const { MODULES, buildIntakeState } = require('./_ai_intake_contract.js');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELD_KEYS = new Set(MODULES.battery.map(x => x.key));
const MIME_TYPES = new Set(['application/pdf', 'text/csv', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const EVENT_KINDS = new Set(['message.add', 'evidence.register', 'candidate.propose',
  'candidate.review', 'session.mode', 'session.approve']);
class ConversationContractError extends Error {
  constructor(code) { super(code); this.name = 'ConversationContractError'; this.code = code; }
}
const fail = code => { throw new ConversationContractError(code); };
const isUuid = v => typeof v === 'string' && UUID_PATTERN.test(v);
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = v => JSON.parse(JSON.stringify(v));
const goodText = (v,max=5000) => typeof v === 'string' && !!v.trim() && v.length <= max;
const canonical = v => String(v).trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const digest = e => createHash('sha256').update(JSON.stringify(e)).digest('hex');

function newConversationSession({session_id,tenant_id,module='battery',mode='ai'}={}) {
  if (!isUuid(session_id) || !isUuid(tenant_id)) fail('INVALID_SESSION_IDENTITY');
  if (module !== 'battery') fail('UNSUPPORTED_MODULE');
  if (!['ai','manual'].includes(mode)) fail('INVALID_MODE');
  return {schema_version:1,session_id,tenant_id,module,mode,revision:0,
    messages:[],evidence:[],candidates:[],approval:null,audit:[]};
}
function envelope(state,event) {
  if (!isObject(state) || state.module !== 'battery' || !isUuid(state.session_id) ||
      !isUuid(state.tenant_id) || !Number.isSafeInteger(state.revision) ||
      state.revision < 0 || !['messages','evidence','candidates','audit'].every(x=>Array.isArray(state[x])))
    fail('INVALID_SERVER_STATE');
  if (!isObject(event) || !isUuid(event.event_id) || !isUuid(event.actor_id) ||
      !EVENT_KINDS.has(event.kind)) fail('INVALID_EVENT');
  if (event.tenant_id !== state.tenant_id) fail('TENANT_MISMATCH');
  if (!Number.isSafeInteger(event.expected_revision) || event.expected_revision<0)
    fail('INVALID_EXPECTED_REVISION');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.occurred_at||'') ||
      !Number.isFinite(Date.parse(event.occurred_at))) fail('INVALID_EVENT_TIME');
}
function factView(state) {
  const facts={},source_anchors={},conflicts=[];
  for (const {key} of MODULES.battery) {
    const active=state.candidates.filter(c=>c.field_key===key && c.review_state!=='rejected');
    if (!active.length) continue;
    const conflict=new Set(active.map(c=>canonical(c.value))).size>1;
    if (conflict) conflicts.push(key);
    const verified=!conflict && active.find(c=>c.review_state==='verified');
    const chosen=verified||active[0];
    facts[key]={value:chosen.value,source_type:chosen.source_type,
      source_ref:(chosen.source_type==='user'?'conversation:':'evidence:')+chosen.source_id,
      verified:!!verified};
    source_anchors[key]=chosen.anchor?copy(chosen.anchor):null;
  }
  return {facts,source_anchors,conflicts};
}
function conversationProjection(state) {
  if (!isObject(state) || state.module!=='battery') fail('INVALID_SERVER_STATE');
  const {facts,source_anchors,conflicts}=factView(state);
  // Manual mode here only bypasses PROMPT_REQUIRED for empty AI sessions.
  const contract=buildIntakeState({module:'battery',mode:'manual',facts,
    human_approved:!!state.approval && conflicts.length===0});
  const questions=contract.questions.map(q=>({...q,
    reason:conflicts.includes(q.key)?'conflict':q.reason}));
  return {session_id:state.session_id,module:'battery',mode:state.mode,revision:state.revision,
    onboarding_schema:contract.onboarding_schema,status:conflicts.length?'collecting':contract.status,
    missing_fields:contract.missing_fields,unverified_fields:contract.unverified_fields,
    conflicted_fields:conflicts,questions,facts,source_anchors,
    approval:state.approval?copy(state.approval):null,
    can_generate_onboarding_configuration:!conflicts.length && contract.can_generate,
    can_generate_battery_passport:false,can_publish:false};
}
function reviewer(event) {
  if (!isUuid(event.reviewer_id) || event.reviewer_id!==event.actor_id)
    fail('INVALID_REVIEWER');
}
function mutate(next,event) {
  switch(event.kind) {
    case 'message.add': {
      const m=event.message;
      if (!isObject(m) || !isUuid(m.id) || !['user','assistant'].includes(m.role) ||
          !goodText(m.text,20000)) fail('INVALID_MESSAGE');
      if (next.messages.some(x=>x.id===m.id)) fail('DUPLICATE_MESSAGE');
      next.messages.push({id:m.id,role:m.role,text:m.text,at:event.occurred_at});
      if (m.role==='user') next.approval=null;
      break;
    }
    case 'evidence.register': {
      const e=event.evidence;
      if (!isObject(e) || !isUuid(e.id) ||
          !['document','system','integration'].includes(e.source_type) ||
          !goodText(e.reference,1024) || !goodText(e.name,255) ||
          (e.source_type==='document' && !MIME_TYPES.has(e.mime_type)))
        fail('INVALID_EVIDENCE');
      if (next.evidence.some(x=>x.id===e.id)) fail('DUPLICATE_EVIDENCE');
      next.evidence.push({id:e.id,source_type:e.source_type,reference:e.reference,
        name:e.name,mime_type:e.mime_type||null,at:event.occurred_at});
      next.approval=null;
      break;
    }
    case 'candidate.propose': {
      const c=event.candidate;
      if (!isObject(c) || !isUuid(c.id) || !FIELD_KEYS.has(c.field_key) ||
          !goodText(c.value) || !isUuid(c.source_id) ||
          !['user','document','system','integration'].includes(c.source_type) ||
          c.verified!==undefined || c.review_state!==undefined)
        fail('INVALID_CANDIDATE');
      if (next.candidates.some(x=>x.id===c.id)) fail('DUPLICATE_CANDIDATE');
      if (c.source_type==='user') {
        if (!next.messages.some(m=>m.id===c.source_id && m.role==='user'))
          fail('SOURCE_NOT_FOUND');
      } else if (!next.evidence.some(e=>e.id===c.source_id && e.source_type===c.source_type))
        fail('SOURCE_NOT_FOUND');
      if (c.anchor!==undefined) {
        const a=c.anchor;
        if (!isObject(a) || Object.keys(a).some(k=>!['page','row','sheet'].includes(k)) ||
            (a.page!==undefined && (!Number.isSafeInteger(a.page)||a.page<=0)) ||
            (a.row!==undefined && (!Number.isSafeInteger(a.row)||a.row<=0)) ||
            (a.sheet!==undefined && !goodText(a.sheet,128))) fail('INVALID_SOURCE_ANCHOR');
      }
      if (c.source_type==='document' && (!isObject(c.anchor)||!(c.anchor.page||c.anchor.row)))
        fail('MISSING_DOCUMENT_ANCHOR');
      next.candidates.push({id:c.id,field_key:c.field_key,value:c.value,
        source_type:c.source_type,source_id:c.source_id,anchor:c.anchor?copy(c.anchor):null,
        review_state:'proposed',reviewer_id:null,reviewed_at:null});
      next.approval=null;
      break;
    }
    case 'candidate.review': {
      reviewer(event);
      if (!isUuid(event.candidate_id) || !['verified','rejected'].includes(event.decision))
        fail('INVALID_REVIEW_DECISION');
      const c=next.candidates.find(x=>x.id===event.candidate_id);
      if (!c) fail('CANDIDATE_NOT_FOUND');
      if (c.review_state==='rejected' ||
          (c.review_state==='verified' && event.decision==='verified'))
        fail('CANDIDATE_ALREADY_REVIEWED');
      if (event.decision==='verified') {
        const others=next.candidates.filter(x=>x.field_key===c.field_key &&
          x.id!==c.id && x.review_state!=='rejected');
        if (others.some(x=>canonical(x.value)!==canonical(c.value)))
          fail('CONFLICT_REQUIRES_REVIEW');
        if (others.some(x=>x.review_state==='verified')) fail('FIELD_ALREADY_VERIFIED');
      }
      c.review_state=event.decision;
      c.reviewer_id=event.actor_id;
      c.reviewed_at=event.occurred_at;
      next.approval=null;
      break;
    }
    case 'session.mode':
      if (!['manual','ai'].includes(event.mode)) fail('INVALID_MODE');
      next.mode=event.mode; break;
    case 'session.approve': {
      reviewer(event);
      const projected=conversationProjection(next);
      if (projected.status!=='review_required' || projected.conflicted_fields.length ||
          projected.missing_fields.length || projected.unverified_fields.length)
        fail('INCOMPLETE_FACT_REVIEW');
      next.approval={actor_id:event.actor_id,at:event.occurred_at,
        approved_revision:next.revision+1};
      break;
    }
    default: fail('INVALID_EVENT');
  }
}
function applyConversationEvent(state,event) {
  envelope(state,event);
  const sha256=digest(event),old=state.audit.find(x=>x.event_id===event.event_id);
  if (old) {
    if (old.sha256!==sha256) fail('EVENT_ID_REUSED');
    return copy(state);
  }
  if (event.expected_revision!==state.revision) fail('REVISION_CONFLICT');
  if (state.audit.length>=10000 || state.messages.length>=2000 ||
      state.evidence.length>=1000 || state.candidates.length>=5000)
    fail('SESSION_CAPACITY_REACHED');
  const next=copy(state);
  mutate(next,event);
  next.revision+=1;
  next.audit.push({event_id:event.event_id,kind:event.kind,actor_id:event.actor_id,
    sha256,revision:next.revision,at:event.occurred_at});
  return next;
}
function replayConversationEvents(config,events) {
  if (!Array.isArray(events)) fail('INVALID_EVENT_LOG');
  let state=newConversationSession(config);
  for (const e of events) state=applyConversationEvent(state,e);
  return state;
}
module.exports={ConversationContractError,newConversationSession,applyConversationEvent,
  replayConversationEvents,conversationProjection};
