#!/usr/bin/env python3
from __future__ import annotations
import importlib.util,json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/'data/migration-deployment-gate-policy.json').read_text(encoding='utf-8'))
snapshot=json.loads((ROOT/'data/bound-supabase-migration-snapshot.json').read_text(encoding='utf-8'))

assert policy.get('version')==1 and policy.get('task')=='C04' and policy.get('status')=='partial'
assert policy['bound_project_id']=='frhletkiuupgksmgxoxc'
assert snapshot['project_id']==policy['bound_project_id']
assert snapshot['source']=='Supabase list_migrations read-only connector'

pattern=re.compile(policy['filename_pattern'])
repo=[]
for path in sorted((ROOT/policy['migration_dir']).glob('*.sql')):
    m=pattern.match(path.name)
    assert m, f'invalid migration filename: {path.name}'
    repo.append(m.group(2))
assert repo, 'no repository migrations'
assert len(repo)==len(set(repo))
applied=[m['name'] for m in snapshot['applied_migrations']]
missing=sorted(set(repo)-set(applied))
assert not missing, f'bound Supabase snapshot missing repo migrations: {missing}'

gate=policy['gate']
assert gate['default']=='deny'
assert gate['require_exact_candidate_commit'] is True
assert gate['require_manifest_sha256'] is True
assert gate['require_all_manifest_names_applied'] is True
assert gate['require_schema_verification_pass'] is True
assert gate['compare_database_by']=='canonical_name'
assert gate['compare_repo_contents_by']=='sha256'

for script in ['scripts/generate_migration_release_manifest.py','scripts/verify_migration_gate_evidence.py']:
    assert (ROOT/script).is_file(), script

remaining=' '.join(policy['remaining'])
assert 'C03 must be GREEN' in remaining
assert 'release-time database snapshot' in remaining
print(f'C04_MIGRATION_GATE_POLICY_PASS: {len(repo)} repository migrations are covered by the read-only bound Supabase snapshot; release manifest/gate are fail-closed')
