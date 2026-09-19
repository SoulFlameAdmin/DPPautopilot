#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/'data/production-smoke-policy.json').read_text(encoding='utf-8'))
assert p.get('version')==1 and p.get('task')=='C07' and p.get('status')=='partial'
assert p['canonical']['source_repo']=='SoulFlameAdmin/DPPautopilot'
assert p['canonical']['source_branch']=='main'
assert p['canonical']['environment']=='production'
assert p['canonical']['vercel_project_id']=='prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr'
assert p['required_checks']==['home','auth_ui','core_api_auth_boundary','public_passport']
assert len(p['global_security_headers'])==6
assert p['decision']=={
  'default':'deny',
  'require_tls_verified':True,
  'require_exact_commit_alignment':True,
  'require_smoke_after_deployment_ready':True
}
assert p['live_state']['production_smoke_executed'] is False
assert p['live_state']['production_deployments_observed']==0
assert p['live_state']['deployment_lease_required_for_this_precursor'] is False
remaining=' '.join(p['remaining'])
for token in ['C03','C06','F08','READY','Timestamped','passport']:
    assert token.lower() in remaining.lower()
for path in ['scripts/verify_production_smoke.py','tests/unit/test_production_smoke.py','docs/C07_PRODUCTION_SMOKE_PROGRESS.md']:
    assert (ROOT/path).is_file(), path
print('C07_PRODUCTION_SMOKE_POLICY_PASS: timestamped TLS/release-gate/home/auth/API/public-passport evidence contract is versioned fail-closed without claiming live production smoke')
