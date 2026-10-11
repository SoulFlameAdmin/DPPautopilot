'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '../../scripts/c04-owner-export-scope-verify.mjs');
const now = '2026-10-11T01:04:32Z';
function setup() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'c04-owner-scope-'));
  const root = path.join(temp, 'storage');
  fs.mkdirSync(path.join(root, 'private'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'private', 'a.bin'), Buffer.from('important-private-data'));
  fs.writeFileSync(path.join(root, 'public', 'b.bin'), Buffer.from('public-data'));
  const files = ['private/a.bin', 'public/b.bin'].map(relativePath => {
    const b = fs.readFileSync(path.join(root, ...relativePath.split('/')));
    return { relativePath, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') };
  });
  const manifest = { schemaVersion: 'C04_LOCAL_BYTES_MANIFEST_V1', generatedAtUtc: now, fileCount: 2, totalBytes: files[0].bytes + files[1].bytes, files };
  const inventory = { schemaVersion: 'C04_STORAGE_INVENTORY_V1', projectRef: 'frhletkiuupgksmgxoxc', capturedAtUtc: now, bucketCount: 3, objectCount: 2, estimatedBytes: manifest.totalBytes, buckets: [
    { id: 'private', objectCount: 1, estimatedBytes: files[0].bytes },
    { id: 'public', objectCount: 1, estimatedBytes: files[1].bytes },
    { id: 'empty', objectCount: 0, estimatedBytes: 0 }
  ] };
  const inv = path.join(temp, 'inventory.json'), man = path.join(temp, 'manifest.json');
  function run() {
    fs.writeFileSync(inv, JSON.stringify(inventory));
    fs.writeFileSync(man, JSON.stringify(manifest));
    const r = spawnSync(process.execPath, [script, 'verify', inv, man, root], { encoding: 'utf8' });
    return { exit: r.status, report: JSON.parse(r.stdout), stderr: r.stderr };
  }
  return { temp, root, manifest, inventory, run };
}
test('matching local bytes and all buckets: scope match, NEVER recovery PASS', () => {
  const x = setup(), r = x.run();
  assert.equal(r.exit, 0, r.stderr);
  assert.equal(r.report.scopeStatus, 'SCOPE_MATCH_ONLY');
  assert.equal(r.report.bucketCount, 3);
  assert.equal(r.report.objectCount, 2);
  assert.equal(r.report.c04Status, 'RED');
  assert.equal(r.report.baselineRecoveryPass, false);
  assert.equal(r.report.dbBackupVerified, false);
  assert.equal(JSON.stringify(r.report).includes('important-private-data'), false);
});
test('missing file fails closed', () => {
  const x = setup();
  fs.unlinkSync(path.join(x.root, 'private', 'a.bin'));
  assert.equal(x.run().report.scopeStatus, 'BLOCKED');
});
test('changed bytes fail SHA256', () => {
  const x = setup();
  fs.writeFileSync(path.join(x.root, 'private', 'a.bin'), 'X'.repeat(x.manifest.files[0].bytes));
  const r = x.run();
  assert.equal(r.exit, 1);
  assert.equal(r.report.reason, 'STORAGE_SHA256_MISMATCH');
});
test('incomplete scope fails even if local manifest is self-consistent', () => {
  const x = setup();
  x.manifest.files.shift();
  x.manifest.fileCount = 1;
  x.manifest.totalBytes = x.manifest.files[0].bytes;
  fs.unlinkSync(path.join(x.root, 'private', 'a.bin'));
  assert.equal(x.run().report.reason, 'SCOPE_TOTAL_MISMATCH');
});
test('per-bucket mismatch fails even when global total unchanged', () => {
  const x = setup(), a = x.inventory.buckets[0], b = x.inventory.buckets[1];
  a.objectCount = 0; b.objectCount = 2;
  a.estimatedBytes = 0; b.estimatedBytes = x.manifest.totalBytes;
  assert.equal(x.run().report.reason, 'BUCKET_SCOPE_MISMATCH');
});
test('duplicate manifest path rejected', () => {
  const x = setup();
  x.manifest.files[1].relativePath = x.manifest.files[0].relativePath;
  assert.equal(x.run().report.reason, 'DUPLICATE_MANIFEST_PATH');
});
test('path traversal rejected and private path not emitted', () => {
  const x = setup();
  x.manifest.files[0].relativePath = '../outside/secret';
  const r = x.run();
  assert.equal(r.report.reason, 'UNSAFE_MANIFEST_PATH');
  assert.equal(JSON.stringify(r.report).includes('outside/secret'), false);
});
test('wrong Supabase project rejected', () => {
  const x = setup();
  x.inventory.projectRef = 'wrong';
  assert.equal(x.run().report.reason, 'WRONG_PROJECT_REF');
});
test('symbolic links rejected', () => {
  const x = setup();
  try { fs.symlinkSync(path.join(x.temp, 'inventory.json'), path.join(x.root, 'private', 'link')); }
  catch (_) { return; }
  assert.equal(x.run().report.reason, 'SYMLINK_NOT_ALLOWED');
});
test('timestamps required', () => {
  const x = setup();
  delete x.inventory.capturedAtUtc;
  assert.equal(x.run().report.reason, 'INVENTORY_TIMESTAMP_REQUIRED');
});
test('local-only, fail-closed, no secrets or subprocess primitives', () => {
  const s = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(s, /\bprocess\.env\b|\bfetch\s*\(|from ['"]node:(?:http|https|net|child_process)['"]|\bexec(?:File)?\s*\(/);
  assert.match(s, /c04Status:\s*'RED'/);
});
