'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// Static regression only: real two-account SQL execution remains required before merge.
const migrationDir=path.resolve(__dirname,'../../supabase/migrations');
const files=[
  ['20261009222700_dpp_ai_conversation_cas_v2.sql',3],
  ['20261009222900_dpp_ai_manual_candidate_cas_v1.sql',1],
];
for(const [filename,expected] of files){
  test(filename+' requires the original actor on every idempotent replay',()=>{
    const sql=fs.readFileSync(path.join(migrationDir,filename),'utf8');
    const retryBranches=[...sql.matchAll(/if v_existing\.request_kind='[^']+'([\s\S]*?)return v_existing\.response_json \|\| jsonb_build_object\('idempotent_retry',true\);/g)];
    assert.equal(retryBranches.length,expected,'unexpected number of retry paths');
    for(const match of retryBranches){
      assert.match(match[1],/and v_existing\.created_by\s*=\s*v_user\b/);
      assert.match(match[1],/and v_existing\.request_sha256\s*=\s*v_request_hash\b/);
    }
    assert.match(sql,/using errcode='DP409'/);
  });
}
