#!/usr/bin/env node
// Read-only C04 owner-side verification of files exported by an authorized operator.
// No network, environment secrets, child processes, downloads, migrations or restores.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROJECT_REF = 'frhletkiuupgksmgxoxc';
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_OBJECTS = 250000;

function assert(ok, code) { if (!ok) throw new Error(code); }
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
function utc(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
function loadJson(name) {
  const st = fs.lstatSync(name);
  assert(st.isFile() && !st.isSymbolicLink() && st.size <= MAX_JSON_BYTES, 'INVALID_PRIVATE_JSON_FILE');
  return JSON.parse(fs.readFileSync(name, 'utf8'));
}
function safeSegment(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 255 &&
    !/[\\/\x00-\x1f\x7f:]/.test(name) && name !== '.' && name !== '..' && !name.startsWith('~');
}
function safeRelative(relative) {
  if (typeof relative !== 'string' || relative.length === 0 || relative.length > 2048 ||
      relative.includes('\\') || relative.startsWith('/') || relative.includes('\0') ||
      path.posix.normalize(relative) !== relative || path.win32.isAbsolute(relative)) return null;
  const parts = relative.split('/');
  if (parts.length < 2 || !parts.every(safeSegment)) return null;
  return parts;
}
function parseInventory(raw) {
  assert(raw && raw.schemaVersion === 'C04_STORAGE_INVENTORY_V1', 'INVALID_INVENTORY_VERSION');
  assert(raw.projectRef === PROJECT_REF, 'WRONG_PROJECT_REF');
  assert(utc(raw.capturedAtUtc), 'INVENTORY_TIMESTAMP_REQUIRED');
  assert(Array.isArray(raw.buckets) && raw.buckets.length > 0 && raw.buckets.length <= 1024, 'INVALID_BUCKET_LIST');
  const map = new Map();
  let count = 0, bytes = 0;
  for (const bucket of raw.buckets) {
    assert(bucket && safeSegment(bucket.id) && integer(bucket.objectCount) && integer(bucket.estimatedBytes), 'INVALID_BUCKET_ROW');
    assert(!map.has(bucket.id), 'DUPLICATE_BUCKET');
    map.set(bucket.id, { count: bucket.objectCount, bytes: bucket.estimatedBytes });
    count += bucket.objectCount;
    bytes += bucket.estimatedBytes;
    assert(integer(count) && integer(bytes), 'INVENTORY_OVERFLOW');
  }
  assert(integer(raw.bucketCount) && raw.bucketCount === map.size, 'INVENTORY_BUCKET_TOTAL_MISMATCH');
  assert(integer(raw.objectCount) && raw.objectCount === count && count <= MAX_OBJECTS, 'INVENTORY_OBJECT_TOTAL_MISMATCH');
  assert(integer(raw.estimatedBytes) && raw.estimatedBytes === bytes, 'INVENTORY_BYTE_TOTAL_MISMATCH');
  return { map, count, bytes, at: raw.capturedAtUtc };
}
function parseManifest(raw) {
  assert(raw && raw.schemaVersion === 'C04_LOCAL_BYTES_MANIFEST_V1', 'INVALID_MANIFEST_VERSION');
  assert(utc(raw.generatedAtUtc), 'MANIFEST_TIMESTAMP_REQUIRED');
  assert(Array.isArray(raw.files) && raw.files.length <= MAX_OBJECTS, 'INVALID_MANIFEST_FILES');
  assert(integer(raw.fileCount) && raw.fileCount === raw.files.length, 'MANIFEST_COUNT_MISMATCH');
  const seen = new Set(), counts = new Map();
  let total = 0;
  for (const entry of raw.files) {
    assert(entry && integer(entry.bytes) && /^[a-f0-9]{64}$/.test(entry.sha256), 'INVALID_MANIFEST_ENTRY');
    const parts = safeRelative(entry.relativePath);
    assert(parts, 'UNSAFE_MANIFEST_PATH');
    assert(!seen.has(entry.relativePath), 'DUPLICATE_MANIFEST_PATH');
    seen.add(entry.relativePath);
    const aggregate = counts.get(parts[0]) ?? { count: 0, bytes: 0 };
    aggregate.count++;
    aggregate.bytes += entry.bytes;
    assert(integer(aggregate.bytes), 'MANIFEST_OVERFLOW');
    counts.set(parts[0], aggregate);
    total += entry.bytes;
    assert(integer(total), 'MANIFEST_OVERFLOW');
  }
  assert(integer(raw.totalBytes) && total === raw.totalBytes, 'MANIFEST_BYTE_TOTAL_MISMATCH');
  return { files: raw.files, counts, total, at: raw.generatedAtUtc };
}
function validatePathNoLinks(root, parts) {
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const st = fs.lstatSync(current);
    assert(!st.isSymbolicLink(), 'SYMLINK_NOT_ALLOWED');
    assert(i === parts.length - 1 ? st.isFile() : st.isDirectory(), 'INVALID_STORAGE_ENTRY');
  }
  return current;
}
function walk(root, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'SYMLINK_NOT_ALLOWED');
    const relative = rel ? `${rel}/${entry.name}` : entry.name;
    assert(safeRelative(`${relative}/placeholder`), 'UNSAFE_LOCAL_STORAGE_PATH');
    if (entry.isDirectory()) out.push(...walk(root, relative));
    else { assert(entry.isFile(), 'NON_FILE_STORAGE_ENTRY'); out.push(relative); }
    assert(out.length <= MAX_OBJECTS, 'TOO_MANY_LOCAL_FILES');
  }
  return out;
}
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', b => hash.update(b));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}
async function verify(inventoryFile, manifestFile, exportDir) {
  const inventory = parseInventory(loadJson(inventoryFile));
  const manifest = parseManifest(loadJson(manifestFile));
  assert(manifest.files.length === inventory.count && manifest.total === inventory.bytes, 'SCOPE_TOTAL_MISMATCH');
  for (const [bucket, expected] of inventory.map) {
    const actual = manifest.counts.get(bucket) ?? { count: 0, bytes: 0 };
    assert(actual.count === expected.count && actual.bytes === expected.bytes, 'BUCKET_SCOPE_MISMATCH');
  }
  assert([...manifest.counts.keys()].every(b => inventory.map.has(b)), 'EXTRA_BUCKET');
  const root = path.resolve(exportDir);
  const rootStat = fs.lstatSync(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'INVALID_EXPORT_DIRECTORY');
  const actual = walk(root);
  assert(actual.length === manifest.files.length, 'LOCAL_FILE_COUNT_MISMATCH');
  const found = new Set(actual);
  for (const entry of manifest.files) {
    assert(found.has(entry.relativePath), 'STORAGE_FILE_MISSING_OR_EXTRA');
    const file = validatePathNoLinks(root, safeRelative(entry.relativePath));
    const st = fs.lstatSync(file);
    assert(st.size === entry.bytes, 'STORAGE_BYTE_SIZE_MISMATCH');
    assert((await hashFile(file)) === entry.sha256, 'STORAGE_SHA256_MISMATCH');
  }
  return {
    scopeStatus: 'SCOPE_MATCH_ONLY',
    sourceInventoryAuthenticity: 'NOT_VERIFIED_BY_THIS_TOOL',
    projectRef: PROJECT_REF,
    bucketCount: inventory.map.size,
    objectCount: inventory.count,
    verifiedBytes: manifest.total,
    captureDeltaSeconds: Math.abs(Date.parse(manifest.at) - Date.parse(inventory.at)) / 1000,
    dbBackupVerified: false,
    baselineRecoveryPass: false,
    migrationRehearsalPass: false,
    c04Status: 'RED',
    warning: 'Local Storage scope/hash match only. Not proof of complete DB backup, isolated restore, RPO/RTO or production readiness.'
  };
}
const argv = process.argv.slice(2);
if (argv[0] !== 'verify' || argv.length !== 4) {
  console.error('Usage: node scripts/c04-owner-export-scope-verify.mjs verify <private-inventory.json> <private-bytes-manifest.json> <local-export-root>');
  process.exitCode = 2;
} else {
  try {
    console.log(JSON.stringify(await verify(argv[1], argv[2], argv[3]), null, 2));
  } catch (err) {
    // Do not leak private bucket names, filenames, absolute paths or exception messages.
    console.log(JSON.stringify({ scopeStatus: 'BLOCKED', reason: err.message && /^[A-Z0-9_]+$/.test(err.message) ? err.message : 'READ_OR_VALIDATION_ERROR', baselineRecoveryPass: false, migrationRehearsalPass: false, c04Status: 'RED' }, null, 2));
    process.exitCode = 1;
  }
}
