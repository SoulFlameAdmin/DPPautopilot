#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXPECTED_MIGRATIONS = [
  '20261008024500_dpp_organization_ensure.sql',
  '20261008131700_dpp_capacity_update_anon_execute_revoke.sql',
  '20261008131800_dpp_onboarding_truthful_progress.sql',
  '20261009222500_dpp_ai_intake_persistence_v1.sql',
  '20261009222600_dpp_ai_intake_persistence_v1_hardening.sql',
  '20261009222700_dpp_ai_conversation_cas_v2.sql',
  '20261009222800_dpp_ai_candidate_conflict_constraint_fix.sql',
  '20261009222900_dpp_ai_manual_candidate_cas_v1.sql',
  '20261010213000_dpp_ai_request_actor_bound_idempotency.sql',
  '20261010220500_dpp_ai_security_definer_search_path_hardening.sql'
];

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function utcNow() {
  return new Date().toISOString();
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
}

function writeJson(file, value) {
  ensureParent(file);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
}

function walkFiles(root) {
  const base = path.resolve(root);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
    throw new Error(`Directory does not exist: ${root}`);
  }
  const out = [];
  const stack = [base];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort();
}

function buildDirectoryManifest(root) {
  const base = path.resolve(root);
  const files = walkFiles(base).map(file => {
    const stat = fs.statSync(file);
    return {
      relativePath: path.relative(base, file).split(path.sep).join('/'),
      bytes: stat.size,
      sha256: sha256File(file)
    };
  });
  return {
    schemaVersion: 'C04_LOCAL_BYTES_MANIFEST_V1',
    generatedAtUtc: utcNow(),
    sourceRootLocalOnly: base,
    warning: 'PRIVATE LOCAL EVIDENCE. Do not commit this manifest if paths reveal sensitive names.',
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
    files
  };
}

function buildMigrationManifest(migrationDir) {
  const root = path.resolve(migrationDir);
  const migrations = EXPECTED_MIGRATIONS.map(name => {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) throw new Error(`Missing expected migration: ${name}`);
    const stat = fs.statSync(file);
    return { name, bytes: stat.size, sha256: sha256File(file) };
  });
  return {
    schemaVersion: 'C04_MIGRATION_SHA256_MANIFEST_V1',
    generatedAtUtc: utcNow(),
    candidateMigrationCount: migrations.length,
    migrations
  };
}

function verifyManifest(manifestFile, root) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.schemaVersion !== 'C04_LOCAL_BYTES_MANIFEST_V1' || !Array.isArray(manifest.files)) {
    throw new Error('Unsupported or invalid local bytes manifest');
  }
  const base = path.resolve(root);
  const failures = [];
  for (const expected of manifest.files) {
    const file = path.resolve(base, expected.relativePath);
    const relative = path.relative(base, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      failures.push({ relativePath: expected.relativePath, reason: 'path escapes root' });
      continue;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      failures.push({ relativePath: expected.relativePath, reason: 'missing' });
      continue;
    }
    const stat = fs.statSync(file);
    const actualHash = sha256File(file);
    if (stat.size !== expected.bytes || actualHash !== expected.sha256) {
      failures.push({ relativePath: expected.relativePath, reason: 'size-or-sha256-mismatch' });
    }
  }
  return {
    schemaVersion: 'C04_LOCAL_BYTES_VERIFY_V1',
    verifiedAtUtc: utcNow(),
    expectedFiles: manifest.files.length,
    failures,
    pass: failures.length === 0
  };
}

function recoveryPlan() {
  return {
    schemaVersion: 'C04_OWNER_RECOVERY_PLAN_V1',
    status: 'NOT_EXECUTED',
    projectRef: 'frhletkiuupgksmgxoxc',
    noProductionChangesAuthorized: true,
    noNetworkOrBackupExecutionByThisTool: true,
    ownerMustProvide: [
      'Dashboard backup/PITR metadata if any, or approved encrypted logical DB export',
      'Protected destination for DB backup and Storage object-byte backup',
      'Isolated restore target with separate credentials and production callbacks disabled',
      'Authorized operator access for backup/restore',
      'Explicit owner approval before any production SQL or paid resource creation'
    ],
    phaseA_baselineRecovery: {
      marker: 'BASELINE_RECOVERY_PASS',
      requiredEvidence: [
        'DB capture start/end UTC, bytes, SHA-256 and protected artifact reference',
        'Storage capture start/end UTC, bucket/object/byte counts and private checksum manifest',
        'DB-vs-Storage consistency delta/reconciliation note',
        'Isolated baseline restore start/end UTC',
        'Auth/FK/dependency checks plus baseline RLS/RBAC/RPC checks',
        'Storage object-byte checksum verification and ACL verification',
        'Measured baseline restore duration and source-to-backup recovery point delta'
      ]
    },
    phaseB_migrationRehearsal: {
      marker: 'MIGRATION_REHEARSAL_PASS',
      expectedMigrationCount: EXPECTED_MIGRATIONS.length,
      migrations: EXPECTED_MIGRATIONS,
      requiredEvidence: [
        'Exact candidate Git SHA and migration SHA-256 manifest',
        'Clone of successful Phase A restore, never production',
        'All 10 migrations applied in timestamp order only to isolated clone',
        'A2 actor-bound idempotency and DP409 negative two-actor tests',
        'RLS/RBAC/tenant isolation and exact API RPC exposure checks',
        'SECURITY DEFINER fixed search_path checks',
        'Passport/QR identity and Storage-byte integrity checks',
        'Exact-SHA regression links and measured rehearsal duration'
      ]
    },
    hardStop: 'If either phase lacks evidence, C04 remains RED. This tool does not authorize or execute backup, restore, migration, merge, deploy, snapshot refresh or production SQL.',
    secretEnvironmentNamesOnly: ['DPP_DATABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY']
  };
}

function usage() {
  console.log(`Usage:\n  node scripts/c04-owner-recovery-toolkit.mjs plan\n  node scripts/c04-owner-recovery-toolkit.mjs migration-manifest <supabase/migrations> <private-output.json>\n  node scripts/c04-owner-recovery-toolkit.mjs bytes-manifest <exported-bytes-dir> <private-output.json>\n  node scripts/c04-owner-recovery-toolkit.mjs verify-bytes <manifest.json> <restored-bytes-dir>\n  node scripts/c04-owner-recovery-toolkit.mjs file-sha256 <artifact-file>\n\nThis tool never connects to Supabase, never reads environment secret values, and never executes backup/restore commands.`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'plan') {
    console.log(JSON.stringify(recoveryPlan(), null, 2));
  } else if (command === 'migration-manifest') {
    if (args.length !== 2) throw new Error('migration-manifest requires <migration-dir> <output.json>');
    writeJson(args[1], buildMigrationManifest(args[0]));
    console.log(`Wrote private migration checksum manifest: ${args[1]}`);
  } else if (command === 'bytes-manifest') {
    if (args.length !== 2) throw new Error('bytes-manifest requires <exported-bytes-dir> <output.json>');
    writeJson(args[1], buildDirectoryManifest(args[0]));
    console.log(`Wrote private local bytes manifest: ${args[1]}`);
  } else if (command === 'verify-bytes') {
    if (args.length !== 2) throw new Error('verify-bytes requires <manifest.json> <restored-bytes-dir>');
    const result = verifyManifest(args[0], args[1]);
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exitCode = 2;
  } else if (command === 'file-sha256') {
    if (args.length !== 1) throw new Error('file-sha256 requires <artifact-file>');
    const stat = fs.statSync(args[0]);
    if (!stat.isFile()) throw new Error('artifact-file is not a file');
    console.log(JSON.stringify({ file: path.basename(args[0]), bytes: stat.size, sha256: sha256File(args[0]) }, null, 2));
  } else {
    usage();
    if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error(`C04 toolkit error: ${error.message}`);
  process.exitCode = 1;
}
