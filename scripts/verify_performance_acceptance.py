#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from typing import Any
ROOT=Path(__file__).resolve().parents[1]
P=json.loads((ROOT/'data/performance-acceptance-policy.json').read_text())
class PerformanceDenied(AssertionError): pass
def need(c:bool,m:str):
    if not c: raise PerformanceDenied(m)
def verify(e:dict[str,Any],p:dict[str,Any]=P):
    sha=e.get('candidate_commit_sha'); need(isinstance(sha,str) and len(sha)>=7,'candidate commit missing')
    c07=e.get('c07'); t07=e.get('t07'); target=e.get('target'); metrics=e.get('metrics')
    for n,o in [('c07',c07),('t07',t07),('target',target),('metrics',metrics)]: need(isinstance(o,dict),n+' evidence missing')
    need(c07.get('status')=='passed','C07 not passed'); need(c07.get('commit_sha')==sha,'C07 commit mismatch')
    need(t07.get('status')=='passed','T07 not passed')
    need(target.get('environment')==p['performance_target']['environment'],'performance target environment mismatch')
    need(target.get('production_like') is True,'target not production-like')
    need(target.get('uses_production_customer_data') is False,'production customer data forbidden')
    need(target.get('uses_production_database') is False,'production database forbidden')
    need(target.get('commit_sha')==sha,'performance target commit mismatch')
    need(str(target.get('url','')).startswith('https://'),'performance target must use HTTPS')
    need(target.get('tls_verified') is True,'performance target TLS not verified')
    multi=metrics.get('multi_surface'); imp=metrics.get('import_volume')
    need(isinstance(multi,dict),'multi-surface metrics missing'); need(isinstance(imp,dict),'import metrics missing')
    b=p['budgets']['multi_surface']
    need(multi.get('requests',0)>=b['minimum_requests'],'request volume below budget')
    need(multi.get('concurrency',0)>=b['minimum_concurrency'],'concurrency below budget')
    need(isinstance(multi.get('error_rate'),(int,float)) and multi['error_rate']<=b['max_error_rate'],'error-rate budget exceeded')
    need(isinstance(multi.get('p95_ms'),(int,float)) and multi['p95_ms']<=b['max_p95_ms'],'p95 budget exceeded')
    ib=p['budgets']['import_volume']
    need(imp.get('rows',0)>=ib['minimum_rows'],'import volume below budget')
    need(isinstance(imp.get('elapsed_ms'),(int,float)) and imp['elapsed_ms']<=ib['max_elapsed_ms'],'import latency budget exceeded')
    need(e.get('network_scope')=='real_http_tls','synthetic/in-process metrics cannot satisfy C09')
def main():
    ap=argparse.ArgumentParser();ap.add_argument('evidence',type=Path);a=ap.parse_args()
    verify(json.loads(a.evidence.read_text()));print('C09_PERFORMANCE_ACCEPTANCE_PASS: exact-commit production-like real HTTP/TLS metrics satisfy T07-derived request/concurrency/error/p95/import budgets');return 0
if __name__=='__main__': raise SystemExit(main())
