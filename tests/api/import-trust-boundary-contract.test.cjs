'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const importApi=fs.readFileSync(path.join(root,'supabase/migrations/20260919025000_dpp_imports_api.sql'),'utf8');
const importValidator=fs.readFileSync(path.join(root,'supabase/migrations/20260919005000_dpp_import_error_contract.sql'),'utf8');
const mappingApi=fs.readFileSync(path.join(root,'supabase/migrations/20261006040000_dpp_saved_import_mapping_api.sql'),'utf8');
const doc=fs.readFileSync(path.join(root,'docs/E2_3_IMPORT_TRUST_BOUNDARY_20261011.md'),'utf8');

test('review keeps authoritative DB bypass visible instead of claiming HTTP guard closes it',()=>{
  assert.match(importApi,/grant execute on function public\.dpp_api_import_create\(jsonb,uuid\) to authenticated/i);
  assert.match(importApi,/v_errors:=coalesce\(v_row->'validation_errors','\[\]'::jsonb\)/i);
  assert.match(importValidator,/sum\(jsonb_array_length\(validation_errors\)\)/i);
  assert.match(doc,/defense in depth, not authoritative closure/i);
  assert.match(doc,/C04: unchanged and RED/i);
});

test('review pins mapping-path authority gap and existing-model overwrite semantics',()=>{
  assert.match(mappingApi,/grant execute on function public\.dpp_api_import_mapping_save\(uuid,text,text,jsonb,jsonb\) to authenticated/i);
  assert.match(mappingApi,/jsonb_typeof\(e\.value\)<>'string'/i);
  assert.match(importValidator,/on conflict \(organization_id,model_identifier\) do update[\s\S]*canonical_data=excluded\.canonical_data/i);
  assert.doesNotMatch(importValidator,/expected_updated_at|expected_version|compare[-_ ]and[-_ ]swap/i);
  assert.match(doc,/Existing-model overwrite and concurrency gap/i);
  assert.match(doc,/lost updates/i);
});
