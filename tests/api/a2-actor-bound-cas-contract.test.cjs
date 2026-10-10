'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../../supabase/migrations');
function source(name){
 return fs.readFileSync(path.join(root,name),'utf8');
}
function body(sql,name){
 const i=sql.indexOf('create or replace function public.'+name+'(');
 assert.ok(i>=0,'Missing expected CAS function '+name);
 const end=sql.indexOf('end\n$fn$;',i);
 assert.ok(end>i,'Missing function end '+name);
 return sql.slice(i,end+9);
}
const cas=source('20261009222700_dpp_ai_conversation_cas_v2.sql');
const manual=source('20261009222900_dpp_ai_manual_candidate_cas_v1.sql');
for(const [kind,name,sql] of [
 ['turn','dpp_api_ai_intake_turn_save_cas',cas],
 ['review','dpp_api_ai_intake_candidate_review_cas',cas],
 ['approval','dpp_api_ai_intake_session_approve_cas',cas],
 ['manual','dpp_api_ai_intake_manual_candidate_cas',manual]
]){
 test('A2 '+kind+' prevents cross-actor idempotency replay',()=>{
  const part=body(sql,name);
  assert.match(part,/v_org\s*:?=\s*public\.dpp_require_active_role/);
  assert.match(part,/v_user\s*:?=\s*public\.dpp_request_user_id/);
  assert.match(part,/for update;/i);
  assert.match(part,/v_existing\.request_kind\s*=/);
  assert.match(part,/and v_existing\.created_by=v_user/);
  assert.match(part,/v_existing\.request_sha256=v_request_hash/);
  assert.match(part,/raise exception '[^']+' using errcode='DP409'/);
  assert.doesNotMatch(part,/can_publish',true/);
 });
}
