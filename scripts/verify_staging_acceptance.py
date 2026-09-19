#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY=json.loads((ROOT/'data/staging-acceptance-policy.json').read_text(encoding='utf-8'))

class StagingAcceptanceDenied(AssertionError):
    pass

def need(condition:bool,message:str)->None:
    if not condition:
        raise StagingAcceptanceDenied(message)

def verify(e:dict[str,Any],policy:dict[str,Any]=POLICY)->None:
    candidate=e.get('candidate_commit_sha')
    need(isinstance(candidate,str) and len(candidate)>=7,'candidate commit missing')
    preview=e.get('preview')
    regression=e.get('regression')
    config=e.get('environment_config')
    migration=e.get('migration_schema')
    smoke=e.get('smoke')
    for name,obj in [('preview',preview),('regression',regression),('environment_config',config),('migration_schema',migration),('smoke',smoke)]:
        need(isinstance(obj,dict),f'{name} evidence missing')

    canonical=policy['canonical']
    need(preview.get('verified') is True,'preview not verified')
    need(preview.get('project_id')==canonical['vercel_project_id'],'preview project mismatch')
    need(preview.get('environment')==canonical['environment'],'preview environment mismatch')
    need(preview.get('state')=='READY','preview not READY')
    need(preview.get('commit_sha')==candidate,'preview commit mismatch')
    need(bool(preview.get('deployment_id')),'preview deployment id missing')
    need(bool(preview.get('url')),'preview URL missing')

    need(regression.get('status')=='passed','full regression not passed')
    need(regression.get('commit_sha')==candidate,'regression commit mismatch')
    need(regression.get('clean_checkout') is True,'regression not from clean checkout')
    suites=regression.get('suites')
    need(isinstance(suites,list),'regression suites missing')
    missing=sorted(set(policy['required_suites'])-set(suites))
    need(not missing,'mandatory suites missing: '+','.join(missing))

    need(config.get('production_like') is True,'staging config not production-like')
    need(config.get('uses_production_customer_data') is False,'production customer data forbidden in staging')
    need(config.get('uses_production_database') is False,'production database forbidden in staging acceptance')
    need(config.get('data_classification') in {'synthetic','sanitized'},'staging data must be synthetic or sanitized')

    need(migration.get('status')=='passed','migration/schema verification not passed')
    need(migration.get('commit_sha')==candidate,'migration/schema commit mismatch')

    need(smoke.get('status')=='passed','staging smoke not passed')
    need(smoke.get('commit_sha')==candidate,'smoke commit mismatch')
    need(smoke.get('security_headers')=='passed','staging security headers not passed')
    routes=smoke.get('core_routes')
    need(isinstance(routes,list) and len(routes)>=3,'insufficient core-route smoke evidence')
    for row in routes:
        need(isinstance(row,dict) and row.get('status') in {200,401},'invalid core-route smoke row')

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('evidence',type=Path)
    args=ap.parse_args()
    verify(json.loads(args.evidence.read_text(encoding='utf-8')))
    print('C06_STAGING_ACCEPTANCE_EVIDENCE_PASS: exact candidate preview/regression/config/migration/smoke evidence passes fail-closed staging contract')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
