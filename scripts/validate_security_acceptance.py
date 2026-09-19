#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/'data/security-acceptance-policy.json').read_text(encoding='utf-8'))

assert p['version']==1 and p['task']=='C10' and p['status']=='partial'
assert p['canonical']['source_repo']=='SoulFlameAdmin/DPPautopilot'
assert p['canonical']['source_branch']=='main'
assert p['canonical']['vercel_project_id']=='prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr'
assert p['canonical']['environment']=='production'
assert p['required_security_tasks']==[f'R{i:02d}' for i in range(1,15)]
a=p['acceptance']
assert a['require_all_security_tasks_passed'] is True
assert a['require_exact_c07_commit_and_deployment'] is True
assert a['require_live_production_evidence'] is True
assert a['unresolved_critical_max']==0 and a['unresolved_high_max']==0
assert a['require_issue_inventory'] is True
assert a['require_repository_hygiene_pass'] is True
assert p['decision']['default']=='deny'
assert p['live_state']['security_acceptance_executed'] is False
assert p['live_state']['deployment_lease_required_for_this_precursor'] is False
remaining=' '.join(p['remaining'])
for token in ['R01-R14','C07','live production','critical/high','security hygiene']:
    assert token.lower() in remaining.lower()
for path in ['scripts/verify_security_acceptance.py','tests/unit/test_security_acceptance.py','docs/C10_SECURITY_ACCEPTANCE_PROGRESS.md']:
    assert (ROOT/path).is_file(), path
print('C10_SECURITY_ACCEPTANCE_POLICY_PASS: R01-R14 + exact C07 production identity + live security evidence + zero unresolved critical/high policy is versioned fail-closed')
