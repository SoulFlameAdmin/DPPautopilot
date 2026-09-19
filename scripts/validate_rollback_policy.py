#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/'data/rollback-procedure-policy.json').read_text(encoding='utf-8'))

assert p.get('version')==1 and p.get('task')=='C05' and p.get('status')=='partial'
assert p.get('default_decision')=='deny'
assert p['canonical']['vercel_project_id']=='prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr'
assert p['canonical']['supabase_project_id']=='frhletkiuupgksmgxoxc'
assert set(p['strategies'])=={'application_rollback','forward_fix','isolated_restore_then_recover'}
assert p['strategies']['application_rollback']['database_mutation'] is False
assert p['strategies']['forward_fix']['destructive_database_rollback'] is False
assert p['strategies']['isolated_restore_then_recover']['direct_production_restore'] is False
assert len(p.get('safety_rules',[]))>=6
rules=' '.join(p['safety_rules']).lower()
for token in ['database','storage','vercel','authentication','audit','forward-fix']:
    assert token in rules
assert p['runtime_state']=={
  'live_rollback_executed':False,
  'live_database_restore_executed':False,
  'deployment_lease_required_for_this_precursor':False
}
remaining=' '.join(p['remaining'])
for token in ['C03','C04','last-known-good','backup','live rollback']:
    assert token.lower() in remaining.lower()
for path in ['scripts/verify_rollback_evidence.py','tests/unit/test_rollback_evidence.py','docs/C05_ROLLBACK_PROCEDURE_PROGRESS.md']:
    assert (ROOT/path).is_file(), path
print('C05_ROLLBACK_POLICY_PASS: app rollback, forward-fix and isolated-restore recovery paths are versioned fail-closed without claiming live rollback')
