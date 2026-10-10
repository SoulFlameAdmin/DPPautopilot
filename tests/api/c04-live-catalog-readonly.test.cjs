'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.resolve(__dirname,'../../scripts/c04-live-catalog-readonly.sql'),'utf8');
const stripped=sql.replace(/^\s*--[^\n]*/gm,'');
const queries=stripped.split(';').map(q=>q.trim()).filter(Boolean);

test('C04 live object audit has only three read-only catalog queries',()=>{
  assert.equal(queries.length,3);
  assert.ok(queries.every(q=>/^(WITH|SELECT)\s/i.test(q)));
  const withoutLiterals=stripped.replace(/'(?:''|[^'])*'/g,"''");
  assert.doesNotMatch(withoutLiterals,/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|EXECUTE|COMMIT|BEGIN|DO)\b/i);
});
test('all four actor-bound CAS functions and old unbound names are inspected',()=>{
  for(const name of ['turn_save_cas','candidate_review_cas','session_approve_cas','manual_candidate_cas']){
    assert.ok(sql.includes('dpp_api_ai_intake_'+name));
    assert.ok(sql.includes('dpp_api_ai_intake_'+name+'_unbound'));
  }
});
test('security grant evidence explicitly checks anon and authenticated roles',()=>{
  assert.match(sql,/has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
  assert.match(sql,/has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.ok(sql.includes('dpp_api_technical_pilot_update_capacity'));
  assert.ok(sql.includes('dpp_api_organization_ensure'));
});
test('all six A2 tables are inventoried without reading their rows',()=>{
  for(const name of ['sessions','messages','candidates','approvals','requests','events'])
    assert.ok(sql.includes('dpp_ai_intake_'+name));
  assert.ok(sql.includes('to_regclass'));
});
test('audit does not mark C04 green or mutate snapshot',()=>{
  const document=fs.readFileSync(path.resolve(__dirname,'../../docs/c04-live-catalog-evidence-20261010.md'),'utf8');
  assert.match(document,/C04 = RED/);
  assert.match(document,/read-only/i);
  assert.match(document,/explicit human authorization/i);
});
