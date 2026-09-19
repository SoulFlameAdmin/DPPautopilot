#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY=json.loads((ROOT/'data/security-acceptance-policy.json').read_text(encoding='utf-8'))

class SecurityAcceptanceDenied(AssertionError):
    pass

def need(condition:bool,message:str)->None:
    if not condition:
        raise SecurityAcceptanceDenied(message)

def verify(e:dict[str,Any],p:dict[str,Any]=POLICY)->None:
    candidate=e.get('candidate_commit_sha')
    need(isinstance(candidate,str) and len(candidate)>=7,'candidate commit missing')

    c07=e.get('c07')
    need(isinstance(c07,dict),'C07 evidence missing')
    need(c07.get('status')=='passed','C07 not passed')
    need(c07.get('commit_sha')==candidate,'C07 commit mismatch')
    need(bool(c07.get('deployment_id')),'C07 deployment id missing')
    need(c07.get('project_id')==p['canonical']['vercel_project_id'],'C07 project mismatch')
    need(c07.get('environment')==p['canonical']['environment'],'C07 environment mismatch')

    controls=e.get('security_tasks')
    need(isinstance(controls,dict),'security task evidence missing')
    missing=sorted(set(p['required_security_tasks'])-set(controls))
    need(not missing,'security tasks missing: '+','.join(missing))
    for task in p['required_security_tasks']:
        row=controls.get(task)
        need(isinstance(row,dict),task+' evidence invalid')
        need(row.get('status')=='passed',task+' not passed')
        need(bool(row.get('evidence_ref')),task+' evidence reference missing')

    need(e.get('repository_security_hygiene')=='passed','repository security hygiene not passed')
    need(e.get('live_production_security')=='passed','live production security evidence not passed')
    need(e.get('live_commit_sha')==candidate,'live security commit mismatch')
    need(e.get('live_deployment_id')==c07.get('deployment_id'),'live security deployment mismatch')

    issues=e.get('issues')
    need(isinstance(issues,list),'security issue inventory missing')
    unresolved={'critical':0,'high':0}
    seen_ids=set()
    for issue in issues:
        need(isinstance(issue,dict),'security issue row invalid')
        iid=issue.get('id')
        need(isinstance(iid,str) and iid,'security issue id missing')
        need(iid not in seen_ids,'duplicate security issue id')
        seen_ids.add(iid)
        sev=issue.get('severity')
        need(sev in p['issue_severities'],'invalid security issue severity')
        status=issue.get('status')
        need(status in {'resolved','open'},'invalid security issue status')
        need(bool(issue.get('summary')),'security issue summary missing')
        if status=='resolved':
            need(bool(issue.get('resolution_evidence')),'resolved issue missing resolution evidence')
        elif sev in unresolved:
            unresolved[sev]+=1

    need(unresolved['critical']<=p['acceptance']['unresolved_critical_max'],'unresolved critical security issue present')
    need(unresolved['high']<=p['acceptance']['unresolved_high_max'],'unresolved high security issue present')

    attestation=e.get('inventory_attestation')
    need(isinstance(attestation,dict),'issue inventory attestation missing')
    need(attestation.get('complete') is True,'security issue inventory not attested complete')
    need(bool(attestation.get('evidence_ref')),'issue inventory attestation evidence missing')

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('evidence',type=Path)
    args=ap.parse_args()
    verify(json.loads(args.evidence.read_text(encoding='utf-8')))
    print('C10_SECURITY_ACCEPTANCE_PASS: R01-R14, exact C07 production identity, live security evidence, repository hygiene and zero unresolved critical/high findings pass fail-closed acceptance')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
