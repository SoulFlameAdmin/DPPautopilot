'use strict';

/**
 * Pure A3 -> manufacturer-onboarding review projection.
 *
 * Input: candidates returned by the A3 extraction adapter AFTER an authorized
 * server has bound the source document to an authenticated tenant.
 * This helper does NOT validate the user/session/tenant, perform an upload,
 * trust client data, approve evidence, or persist a review event.
 *
 * Every output fact remains UNVERIFIED. Conflicts are never resolved by
 * last-write-wins. Output can be passed to the separate A4 question planner
 * only after a server-side authorization and provenance check.
 * Manufacturer onboarding's 8 fields are NOT a full battery DPP.
 */
const { MODULES, buildIntakeState } = require('./_ai_intake_contract.js');
const FIELD_ORDER = Object.freeze(MODULES.battery.map(x => x.key));
const FIELD_SET = new Set(FIELD_ORDER);
const EVIDENCE_REF = /^evidence:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const MAX_CANDIDATES = 1000;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
class DocumentReviewProjectionError extends Error {
 constructor(code) { super(code); this.name='DocumentReviewProjectionError'; this.code=code; }
}
const reject = code => { throw new DocumentReviewProjectionError(code); };
const normalize = s => s.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
function safeValue(value) {
 if(typeof value!=='string'||!value.trim()||value.length>5000||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/i.test(value))
  return false;
 return !/^[\s\uFEFF\u200B-\u200F\u2060-\u206F]*[=+\-@]/.test(value.normalize('NFKC'));
}
function validAnchor(a) {
 if(!isObject(a)) return false;
 const pos = n => Number.isSafeInteger(n) && n >= 1;
 if(pos(a.page) && pos(a.line))
  return Object.keys(a).length===2;
 if(pos(a.row) && pos(a.column)) {
  if(a.sheet===undefined) return Object.keys(a).length===2;
  return Object.keys(a).length===3 &&
   typeof a.sheet==='string' && a.sheet.trim().length>0 && a.sheet.length<=128;
 }
 return false;
}
function normalizeCandidate(c) {
 if(!isObject(c) || !FIELD_SET.has(c.key)) reject('UNKNOWN_OR_INVALID_FIELD');
 if(c.verified!==false || c.source_type!=='document')
  reject('CANDIDATE_IS_NOT_UNVERIFIED_DOCUMENT');
 if(!EVIDENCE_REF.test(c.source_ref||'') || !DIGEST.test(c.source_digest||''))
  reject('INVALID_DOCUMENT_PROVENANCE');
 if(!validAnchor(c.source_anchor)) reject('INVALID_DOCUMENT_ANCHOR');
 if(!safeValue(c.value)) reject('UNSAFE_CANDIDATE_VALUE');
 // Source refs and anchors are review hints, never proof of server authorization.
 return {
  key:c.key, value:c.value.trim(), verified:false, source_type:'document',
  source_ref:c.source_ref, source_digest:c.source_digest.toLowerCase(),
  source_anchor:{...c.source_anchor}
 };
}
function buildDocumentReviewProjection({extraction}={}) {
 if(!isObject(extraction) || !Array.isArray(extraction.candidates) ||
    extraction.candidates.length>MAX_CANDIDATES)
  reject('INVALID_DOCUMENT_EXTRACTION');
 const grouped = new Map(FIELD_ORDER.map(key=>[key,[]]));
 for(const candidate of extraction.candidates) {
  const safe=normalizeCandidate(candidate);
  grouped.get(safe.key).push(safe);
 }
 const facts={}, conflicts=[], choices={};
 for(const key of FIELD_ORDER) {
  const group=grouped.get(key);
  if(!group.length) continue;
  const distinct = new Set(group.map(c=>normalize(c.value)));
  choices[key]=group;
  if(distinct.size>1) {
   conflicts.push(key);
   continue;
  }
  // Preserve one concrete source for intake review, and all sources in choices.
  // Never inherit verified:true from a caller or an imported file.
  facts[key]={
   value:group[0].value, source_type:'document',
   source_ref:group[0].source_ref, verified:false
  };
 }
 const state=buildIntakeState({module:'battery',mode:'manual',facts});
 return {
  schema:'manufacturer-early-v2',
  candidate_count:extraction.candidates.length,
  facts, conflicts, choices,
  missing_fields:state.missing_fields,
  unverified_fields:state.unverified_fields,
  needs_human_review:true,
  can_generate_battery_passport:false,
  can_publish:false,
  // This exact shape is consumable by A4 questionPlan after trusted binding.
  question_plan_input:{facts,conflicts},
  requires_server_authorization:true,
  requires_source_integrity_check:true
 };
}
module.exports={DocumentReviewProjectionError,buildDocumentReviewProjection};
