#!/usr/bin/env python3
import json
from pathlib import Path
R=Path(__file__).resolve().parents[1]; p=json.loads((R/'data/runtime-error-review-policy.json').read_text())
assert p['version']==1 and p['task']=='C08' and p['status']=='partial'
assert p['source_required']=='vercel_runtime_logs'
assert p['acceptance']['minimum_window_minutes']>=30
assert p['acceptance']['unresolved_p0_max']==0 and p['acceptance']['unresolved_p1_max']==0
assert p['acceptance']['require_redaction_attestation'] is True
assert len(p['forbidden_cluster_fields'])>=10
assert p['live_state']['runtime_review_executed'] is False
rem=' '.join(p['remaining'])
for t in ['C07','R09','Vercel runtime logs','30 minutes','P0/P1']: assert t.lower() in rem.lower()
for f in ['scripts/verify_runtime_error_review.py','tests/unit/test_runtime_error_review.py','docs/C08_RUNTIME_ERROR_REVIEW_PROGRESS.md']: assert (R/f).is_file()
print('C08_RUNTIME_ERROR_POLICY_PASS: production runtime-review window, P0/P1 zero-unresolved gate, correlation and redaction rules are versioned fail-closed')
