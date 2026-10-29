#!/usr/bin/env python3
from __future__ import annotations
import importlib.util,json,re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/'data/migration-deployment-gate-policy.json').read_text(encoding='utf-8'))
snapshot=json.loads((ROOT/'data/bound-supabase-migration-snapshot.json').read_text(encoding='utf-8'))

assert policy.get('version')==1 and policy.get('task')=='C04' and policy.get('status')=='partial'
assert policy['bound_project_id']=='frhletkiuupgksmgxoxc'
assert snapshot['project_id']==policy['bound_project_id']
assert snapshot['source']=='Supabase list_migrations read-only connector'
assert snapshot.get('observation_scope')=='repository_canonical_names_only'
try:
    observed=datetime.fromisoformat(snapshot['observed_at'].replace('Z','+00:00'))
except (KeyError,TypeError,ValueError):
    raise AssertionError('C04 bound Supabase snapshot timestamp invalid') from None
assert observed.tzinfo is not None, 'C04 observation must be timezone aware'
age=datetime.now(timezone.utc)-observed
assert -timedelta(minutes=10)<=age<=timedelta(days=30),'C04 snapshot stale/future'

pattern=re.compile(policy['filename_pattern'])
repo=[]
for path in sorted((ROOT/policy['migration_dir']).glob('*.sql')):
    m=pattern.match(path.name)
    assert m, f'invalid migration filename: {path.name}'
    repo.append(m.group(2))
assert repo, 'no repository migrations'
assert len(repo)==len(set(repo))
assert snapshot.get('repository_migrations_at_observation')==len(repo),'C04 snapshot does not cover this repository version'
observed_rows=snapshot.get('applied_migrations')
assert isinstance(observed_rows,list) and observed_rows,'C04 applied migrations empty'
assert all(isinstance(m,dict) and re.fullmatch(r'\\d{14}',m.get('version','')) and
           isinstance(m.get('name'),str) and m['name'] for m in observed_rows),'C04 invalid migration rows'
assert snapshot.get('observed_migrations_total',0)>=len(observed_rows),'C04 invalid observation scope count'
assert snapshot.get('observed_distinct_migration_names',0)>=len(repo),'C04 observation incomplete'
applied=[m['name'] for m in observed_rows]
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
