'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {diff, migrationNames, inspect} = require('../../scripts/c04-readonly-delta.cjs');
const target='frhletkiuupgksmgxoxc';

test('missing migration names are reported, not greenlit', () => {
  const r=diff(['initial','new_migration'], ['initial'],target,target);
  assert.deepEqual(r.repo_migrations_not_applied,['new_migration']);
  assert.equal(r.inventory_match_only,false);
  assert.equal(r.c04_release_pass,false);
});
test('matching inventories still NEVER authorize release', () => {
  const r=diff(['a','b'],['a','b'],target,target);
  assert.equal(r.inventory_match_only,true);
  assert.equal(r.c04_release_pass,false);
});
test('unrelated applied migrations are not treated as absent repo work', () => {
  const r=diff(['dpp_a'],['dpp_a','shared_service'],target,target);
  assert.deepEqual(r.repo_migrations_not_applied,[]);
  assert.deepEqual(r.additional_applied_migrations,['shared_service']);
});
test('wrong bound project fails closed', () => {
  assert.throws(()=>diff(['a'],['a'],'other',target), /WRONG_BOUND_PROJECT/);
});
test('duplicate migration name fails closed', () => {
  assert.throws(()=>diff(['a','a'],['a'],target,target), /DUPLICATE_INVENTORY_NAME/);
});
test('malformed inventory fails closed', () => {
  assert.throws(()=>diff(['a'],[null],target,target), /INVALID_INVENTORY/);
});
test('migration manifest filename validation rejects bad names', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dpp-c04-test-'));
  try{
    fs.writeFileSync(path.join(dir,'20261010000000_ok.sql'),'-- test');
    assert.deepEqual(migrationNames(dir),['ok']);
    fs.writeFileSync(path.join(dir,'bad-migration.sql'),'-- test');
    assert.throws(()=>migrationNames(dir), /INVALID_MIGRATION_FILENAME/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('repo bound snapshot report never claims C04 GREEN', () => {
  const r=inspect();
  assert.equal(r.project_id,target);
  assert.equal(r.c04_release_pass,false);
  assert.ok(r.repo_count>0);
  assert.ok(r.applied_count>0);
  assert.equal(r.mode,'READ_ONLY_PREFLIGHT');
});
