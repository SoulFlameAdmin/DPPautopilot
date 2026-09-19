#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
p=json.loads((ROOT/'data/privacy-compliance-acceptance-policy.json').read_text(encoding='utf-8'))

assert p['version']==1 and p['task']=='C11' and p['status']=='partial'
assert p['dependencies']==['F11','R07','R08']
assert p['required_artifacts']==[
  'docs/REQUIREMENTS_TRACEABILITY.md',
  'data/dpp-field-catalog.json',
  'docs/PRIVACY_DATA_INVENTORY.md',
  'data/privacy-data-inventory.json',
  'data/retention-deletion-policy.json'
]
for path in p['required_artifacts']:
    assert (ROOT/path).is_file(), path
a=p['acceptance']
for key in [
  'require_dependency_evidence','require_traceability_complete','require_privacy_inventory_complete',
  'require_retention_deletion_export_complete','require_external_recipient_scope_reviewed',
  'require_unsupported_claims_zero','require_legal_signoff_separate'
]:
    assert a[key] is True
assert p['decision']['default']=='deny'
assert p['live_state']['privacy_compliance_acceptance_executed'] is False
assert p['live_state']['legal_signoff_executed'] is False
remaining=' '.join(p['remaining'])
for token in ['R07','R08','unsupported compliance claims','C12']:
    assert token.lower() in remaining.lower()
for path in [
  'scripts/verify_privacy_compliance_acceptance.py',
  'tests/unit/test_privacy_compliance_acceptance.py',
  'docs/C11_PRIVACY_COMPLIANCE_ACCEPTANCE_PROGRESS.md'
]:
    assert (ROOT/path).is_file(), path
print('C11_PRIVACY_COMPLIANCE_POLICY_PASS: traceability/privacy/lifecycle/recipient/claim-review evidence is versioned fail-closed and C12 legal sign-off stays separate')
