#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/'data/staging-acceptance-policy.json').read_text(encoding='utf-8'))

assert p.get('version')==1 and p.get('task')=='C06' and p.get('status')=='partial'
assert p['canonical']['source_repo']=='SoulFlameAdmin/DPPautopilot'
assert p['canonical']['source_branch']=='main'
assert p['canonical']['environment']=='preview'
assert p['canonical']['vercel_project_id']=='prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr'
assert p['required_suites']==['T01','T02','T03','T04','T05','T06','T07','T08','T09']
assert p['decision']['default']=='deny'
live=p['live_state']
assert live['staging_acceptance_executed'] is False
assert live['canonical_preview_deployments_observed']>=1
assert live['observed_ready_preview']=={
  'deployment_id':'dpl_kMC7McYaaUaPVdmEXgW5TeUYxd2Q',
  'project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr',
  'state':'READY',
  'environment':'preview',
  'commit_sha':'77fe2a39a18fcb26887b9cee2cc9fd0df5a95da7',
  'url':'dpp-autopilot-95xeakbem-dimitar-lambovs-projects.vercel.app'
}
assert live['deployment_lease_required_for_this_precursor'] is False
remaining=' '.join(p['remaining'])
for token in ['T10','C02','production-like','migration/schema','security-header']:
    assert token.lower() in remaining.lower()
for path in ['scripts/verify_staging_acceptance.py','tests/unit/test_staging_acceptance.py','docs/C06_STAGING_ACCEPTANCE_PROGRESS.md']:
    assert (ROOT/path).is_file(), path
print('C06_STAGING_ACCEPTANCE_POLICY_PASS: canonical READY preview is observed, while staging acceptance remains fail-closed on T10/C02/config/migration/smoke evidence')
