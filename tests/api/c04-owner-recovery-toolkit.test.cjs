'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const scriptPath = path.join(repoRoot, 'scripts/c04-owner-recovery-toolkit.mjs');
const script = fs.readFileSync(scriptPath, 'utf8');
const doc = fs.readFileSync(path.join(repoRoot, 'docs/c04-owner-recovery-toolkit-no-execute-20261010.md'), 'utf8');

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: repoRoot, encoding: 'utf8' });
}

test('toolkit source has no network/process execution primitives or secret reads', () => {
  assert.doesNotMatch(script, /from ['"]node:(?:child_process|http|https|net|tls|dns)['"]/);
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /\bprocess\.env\b/);
  assert.doesNotMatch(script, /\b(?:exec|execFile|spawn|fork)\s*\(/);
});

test('plan is explicitly NOT_EXECUTED and two-phase fail-closed', () => {
  const result = run(['plan']);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.status, 'NOT_EXECUTED');
  assert.equal(plan.noProductionChangesAuthorized, true);
  assert.equal(plan.noNetworkOrBackupExecutionByThisTool, true);
  assert.equal(plan.phaseA_baselineRecovery.marker, 'BASELINE_RECOVERY_PASS');
  assert.equal(plan.phaseB_migrationRehearsal.marker, 'MIGRATION_REHEARSAL_PASS');
  assert.equal(plan.phaseB_migrationRehearsal.expectedMigrationCount, 10);
  assert.match(plan.hardStop, /C04 remains RED/);
});

test('migration manifest freezes exactly the ten expected migrations', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'c04-migrations-'));
  const out = path.join(temp, 'manifest.json');
  const result = run(['migration-manifest', path.join(repoRoot, 'supabase/migrations'), out]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(manifest.schemaVersion, 'C04_MIGRATION_SHA256_MANIFEST_V1');
  assert.equal(manifest.candidateMigrationCount, 10);
  assert.equal(manifest.migrations.length, 10);
  for (const m of manifest.migrations) assert.match(m.sha256, /^[0-9a-f]{64}$/);
});

test('local bytes manifest omits absolute source root and verifies intact files', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'c04-bytes-'));
  const source = path.join(temp, 'source');
  const restored = path.join(temp, 'restored');
  fs.mkdirSync(path.join(source, 'private'), { recursive: true });
  fs.mkdirSync(path.join(restored, 'private'), { recursive: true });
  fs.writeFileSync(path.join(source, 'private', 'a.bin'), Buffer.from([1,2,3,4]));
  fs.copyFileSync(path.join(source, 'private', 'a.bin'), path.join(restored, 'private', 'a.bin'));
  const manifestPath = path.join(temp, 'storage.json');
  let result = run(['bytes-manifest', source, manifestPath]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.sourceRootNotRecorded, true);
  assert.equal(Object.prototype.hasOwnProperty.call(manifest, 'sourceRootLocalOnly'), false);
  result = run(['verify-bytes', manifestPath, restored]);
  assert.equal(result.status, 0, result.stderr);
  const verify = JSON.parse(result.stdout);
  assert.equal(verify.pass, true);
  assert.equal(verify.expectedFiles, 1);
  assert.equal(verify.actualFiles, 1);
});

test('local bytes verification rejects modified and unexpected extra files', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'c04-bytes-tamper-'));
  const source = path.join(temp, 'source');
  const restored = path.join(temp, 'restored');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(restored, { recursive: true });
  fs.writeFileSync(path.join(source, 'a.bin'), Buffer.from([1,2,3,4]));
  fs.copyFileSync(path.join(source, 'a.bin'), path.join(restored, 'a.bin'));
  const manifestPath = path.join(temp, 'storage.json');
  let result = run(['bytes-manifest', source, manifestPath]);
  assert.equal(result.status, 0, result.stderr);

  fs.appendFileSync(path.join(restored, 'a.bin'), Buffer.from([9]));
  fs.writeFileSync(path.join(restored, 'unexpected.bin'), Buffer.from([7]));
  result = run(['verify-bytes', manifestPath, restored]);
  assert.equal(result.status, 2, result.stderr);
  const verify = JSON.parse(result.stdout);
  assert.equal(verify.pass, false);
  assert.ok(verify.failures.some(f => f.reason === 'size-or-sha256-mismatch'));
  assert.ok(verify.failures.some(f => f.reason === 'unexpected-extra-file'));
});

test('documentation preserves hard production boundary and private evidence handling', () => {
  for (const phrase of [
    'C04 remains RED',
    'BASELINE_RECOVERY_PASS',
    'MIGRATION_REHEARSAL_PASS',
    'must never be committed',
    'does not authorize production'
  ]) assert.ok(doc.includes(phrase), `Missing safety phrase: ${phrase}`);
});
