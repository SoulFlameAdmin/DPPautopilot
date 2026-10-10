'use strict';
// Worker A A5: side-effect-free DRAFT BODY PROPOSAL, not a server endpoint.
const matrix=require('../data/lmt-battery-71-v2.json');
const policy=require('./_access_policy.js');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=new Set(['user','document','system','integration']);
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
class A5Error extends Error{constructor(code){super(code);this.code=code;}}
const fail=c=>{throw new A5Error(c);};
const validUUID=x=>typeof x==='string'&&UUID.test(x);
const registry=new Map(matrix.points.map(x=>[x.number,x]));
function typeValid(t,v){
 if(t==='number')return typeof v==='number'&&Number.isFinite(v);
 if(t==='integer')return Number.isSafeInteger(v);
 if(t==='month')return typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
 if(['string','enum','document_ref'].includes(t))return typeof v==='string'&&!!v.trim()&&v.length<=5000;
 if(t==='object')return isObj(v)&&Object.keys(v).length>0;
 if(t==='array'||t==='document_ref_array')return Array.isArray(v)&&v.length>0;
 return false;
}
function put(target,path,value){
 const segments=path.split('.');
 if(!['model','item'].includes(segments[0])||segments.some(s=>!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)))fail('UNSAFE_PATH');
 let node=target;
 for(const key of segments.slice(0,-1)){
  if(!Object.hasOwn(node,key))node[key]={};
  if(!isObj(node[key]))fail('PATH_COLLISION');
  node=node[key];
 }
 const key=segments.at(-1);
 if(Object.hasOwn(node,key))fail('DUPLICATE_PATH');
 node[key]=JSON.parse(JSON.stringify(value));
}
function planBatteryDraft({context,facts=[],approval=null,applicability={}}={}){
 if(!isObj(context)||!validUUID(context.tenant_id)||!validUUID(context.session_id)||
 !validUUID(context.battery_item_id)||!Number.isSafeInteger(context.revision)||
 context.revision<0||context.category!=='light_means_of_transport'||
 typeof context.unique_identifier!=='string'||!context.unique_identifier||
 typeof context.manufacturer_name!=='string'||!context.manufacturer_name||
 typeof context.model_identifier!=='string'||!context.model_identifier)fail('INVALID_CONTEXT');
 if(!Array.isArray(facts)||facts.length>71||!isObj(applicability))fail('INVALID_FACTS');
 const approved=approval!==null;
 if(approved&&(!isObj(approval)||!validUUID(approval.actor_id)||
  !validUUID(approval.event_id)||approval.revision!==context.revision))fail('STALE_APPROVAL');
 const byNumber=new Map();
 for(const f of facts){
  const m=registry.get(f?.number);
  if(!m||byNumber.has(m.number)||!isObj(f)||
   !TYPES.has(f.source_type)||typeof f.source_ref!=='string'||!f.source_ref.trim()||
   !validUUID(f.reviewer_id)||!validUUID(f.review_event_id)||
   typeof f.verified!=='boolean'||!typeValid(m.valueType,f.value))fail('INVALID_FACT');
  byNumber.set(m.number,f);
 }
 for(const [k,v] of Object.entries(applicability)){
  const p=registry.get(Number(k));
  if(!p||p.lmtStatusAt2027_02_18!=='if_applicable'||
    !isObj(v)||typeof v.applies!=='boolean'||!validUUID(v.review_event_id))
   fail('INVALID_APPLICABILITY');
 }
 const public_payload={},private_payload={},provenance=[];
 const missing=[],unverified=[],pending=[],policyReview=[],schemaReview=[],authority=[],ignored=[];
 for(const p of matrix.points){
  const f=byNumber.get(p.number),state=p.lmtStatusAt2027_02_18;
  if(state==='not_required_2027'){if(f)ignored.push(p.number);continue;}
  if(state==='if_applicable'){
   const choice=applicability[p.number];
   if(!choice){pending.push(p.number);continue;}
   if(!choice.applies)continue;
  }
  if(!f){if(state!=='optional')missing.push(p.number);continue;}
  if(!f.verified){unverified.push(p.number);continue;}
  if((p.number===1&&f.value!==context.unique_identifier)||
     (p.number===3&&f.value!==context.manufacturer_name)||
     (p.number===6&&f.value!==context.category)||
     (p.number===7&&f.value!==context.model_identifier))fail('IDENTITY_MISMATCH');
  if(p.access==='authority_only'){authority.push(p.number);continue;}
  if(p.number===2){policyReview.push(p.number);continue;}
  // Fail closed on nested public/private values until typed schemas and access checks exist.
  if(['object','array','document_ref_array'].includes(p.valueType)){
   schemaReview.push(p.number);continue;
  }
  const isPublic=p.access==='public'||p.number===1;
  const isPrivate=['legitimate_interest','legitimate_interest_and_authorities'].includes(p.access);
  if(!isPublic&&!isPrivate){policyReview.push(p.number);continue;}
  put(isPublic?public_payload:private_payload,p.valuePath,f.value);
  provenance.push({point:p.number,path:p.valuePath,access:isPublic?'public':'private',
    source_ref:f.source_ref,review_event_id:f.review_event_id});
 }
 if(policy.findRestrictedPublicPaths(public_payload).length||
    policy.findAuthorityOnlyPaths(private_payload).length)fail('ACCESS_LEAK');
 return {scope:'draft_proposal',category:'light_means_of_transport',
  schema_version:matrix.schemaVersion,has_human_approval:approved,
  draft_body:approved?{battery_item_id:context.battery_item_id,public_payload,private_payload}:null,
  mapped:provenance.length,provenance,missing,unverified,pending_conditional:pending,
  authority_separate:authority,policy_review:policyReview,unmapped_complex_fields:schemaReview,ignored_future:ignored,
  can_publish:false,can_activate:false,compliance_assessed:false,
  server_authorization_and_evidence_validation_required:true};
}
module.exports={A5Error,planBatteryDraft};
