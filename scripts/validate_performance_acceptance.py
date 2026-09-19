#!/usr/bin/env python3
import json
from pathlib import Path
R=Path(__file__).resolve().parents[1];p=json.loads((R/'data/performance-acceptance-policy.json').read_text());t=json.loads((R/'data/load-test-policy.json').read_text())
assert p['version']==1 and p['task']=='C09' and p['status']=='partial'
b=p['budgets']['multi_surface'];tb=t['profiles']['multi_surface_concurrency']
assert b=={'minimum_requests':tb['total_requests'],'minimum_concurrency':tb['concurrency'],'max_error_rate':tb['max_error_rate'],'max_p95_ms':tb['max_p95_ms']}
ib=p['budgets']['import_volume'];ti=t['profiles']['import_batch_volume']
assert ib=={'minimum_rows':ti['rows'],'max_elapsed_ms':ti['max_elapsed_ms']}
assert p['performance_target']['environment']=='preview' and p['performance_target']['production_like'] is True
assert p['performance_target']['uses_production_customer_data'] is False and p['performance_target']['uses_production_database'] is False
assert p['decision']['default']=='deny' and p['decision']['require_exact_c07_commit'] is True
rem=' '.join(p['remaining'])
for x in ['T07','C07','HTTP/TLS','cold-start','SLO']: assert x.lower() in rem.lower()
for f in ['scripts/verify_performance_acceptance.py','tests/unit/test_performance_acceptance.py','docs/C09_PERFORMANCE_ACCEPTANCE_PROGRESS.md']: assert (R/f).is_file()
print('C09_PERFORMANCE_POLICY_PASS: T07-derived exact-commit production-like real-network performance budgets are versioned fail-closed')
