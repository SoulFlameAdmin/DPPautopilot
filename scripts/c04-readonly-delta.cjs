'use strict';

/**
 * C04 READ-ONLY preflight. This is a diagnostic, NEVER a release gate.
 * No database connection, migration writes, grants, credentials, or refreshes.
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const RULE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

function migrationNames(dir) {
  const entries = fs.readdirSync(dir).filter(name => name.endsWith('.sql'));
  const names = entries.map(file => {
    const match = RULE.exec(file);
    if (!match) throw new Error('INVALID_MIGRATION_FILENAME');
    return match[2];
  });
  if (names.length !== new Set(names).size) throw new Error('DUPLICATE_REPO_MIGRATION_NAME');
  return names.sort();
}

function diff(repoNames, applied, projectId, targetProjectId) {
  if (!Array.isArray(repoNames) || !Array.isArray(applied) ||
      repoNames.some(x => typeof x !== 'string') ||
      applied.some(x => typeof x !== 'string')) throw new Error('INVALID_INVENTORY');
  if (projectId !== targetProjectId) throw new Error('WRONG_BOUND_PROJECT');
  if (new Set(repoNames).size !== repoNames.length ||
      new Set(applied).size !== applied.length) throw new Error('DUPLICATE_INVENTORY_NAME');
  const actual = new Set(applied), expected = new Set(repoNames);
  return {
    mode: 'READ_ONLY_PREFLIGHT',
    project_id: projectId,
    repo_count: repoNames.length,
    applied_count: applied.length,
    repo_migrations_not_applied: repoNames.filter(n => !actual.has(n)).sort(),
    additional_applied_migrations: applied.filter(n => !expected.has(n)).sort(),
    inventory_match_only: repoNames.every(n => actual.has(n)),
    c04_release_pass: false,
    reason: 'Snapshot is not release-time schema verification or a C03 approval.'
  };
}

function inspect(root = ROOT, snapshotPath = null) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'data/migration-deployment-gate-policy.json'), 'utf8'));
  if (policy.status !== 'partial' || policy.gate?.default !== 'deny') {
    throw new Error('C04_POLICY_NOT_FAIL_CLOSED');
  }
  const file = snapshotPath || path.join(root, 'data/bound-supabase-migration-snapshot.json');
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (snapshot.source !== 'Supabase list_migrations read-only connector') {
    throw new Error('SNAPSHOT_SOURCE_NOT_VERIFIED');
  }
  if (!Array.isArray(snapshot.applied_migrations)) throw new Error('INVALID_SNAPSHOT');
  const names = snapshot.applied_migrations.map(x => x?.name);
  const result = diff(
    migrationNames(path.join(root, policy.migration_dir)),
    names, snapshot.project_id, policy.bound_project_id
  );
  return {...result, snapshot_observed_at: snapshot.observed_at || null};
}

if (require.main === module) {
  try {
    const result = inspect();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.inventory_match_only) process.exitCode = 2;
  } catch (error) {
    process.stderr.write('C04_READ_ONLY_PREFLIGHT_ERROR: ' + error.message + '\n');
    process.exitCode = 2;
  }
}
module.exports = {migrationNames, diff, inspect};
