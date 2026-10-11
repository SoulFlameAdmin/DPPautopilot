'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const importApi=fs.readFileSync(path.join(root,'supabase/migrations/20260919025000_dpp_imports_api.sql'),'utf8');
const importValidator=fs.readFileSync(path.join(root,'supabase/migrations/20260919005000_dpp_import_error_contract.sql'),'utf8');
const doc=fs.readFileSync(path.join(root,'docs/E2_3_IMPORT_TRUST_BOUNDARY_20261011.md'),'utf8');

test('review keeps authoritative DB bypass visible instead of claiming HTTP guard closes it',()=>{
  assert.match(importApi,/grant execute on function public\.dpp_api_import_create\(jsonb,uuid\) to authenticated/i);
  assert.match(importApi,/v_errors:=coalesce\(v_row->'validation_errors','\[\]'::jsonb\)/i);
  assert.match(importValidator,/sum\(jsonb_array_length\(validation_errors\)\)/i);
  assert.match(doc,/defense in depth, not authoritative closure/i);
  assert.match(doc,/C04: unchanged and RED/i);
});
