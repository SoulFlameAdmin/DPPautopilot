#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY_PATH=ROOT/'data/production-promotion-policy.json'

class PromotionDenied(AssertionError):
    pass

def _require_dict(parent:dict[str,Any],key:str)->dict[str,Any]:
    value=parent.get(key)
    if not isinstance(value,dict):
        raise PromotionDenied(f'{key} evidence missing')
    return value

def verify(evidence:dict[str,Any],policy:dict[str,Any])->None:
    canonical=policy['canonical']
    if evidence.get('source_repo')!=canonical['source_repo']:
        raise PromotionDenied('source repository mismatch')
    if evidence.get('source_branch')!=canonical['source_branch']:
        raise PromotionDenied('production source branch must be main')

    candidate=evidence.get('candidate_commit_sha')
    if not isinstance(candidate,str) or len(candidate)<7:
        raise PromotionDenied('candidate commit missing')

    ci=_require_dict(evidence,'ci')
    preview=_require_dict(evidence,'preview')
    migration=_require_dict(evidence,'migration_gate')
    security=_require_dict(evidence,'security_smoke')
    target=_require_dict(evidence,'production_target')

    if ci.get('status')!='success':
        raise PromotionDenied('pull-request CI is not successful')
    if ci.get('commit_sha')!=candidate:
        raise PromotionDenied('CI commit does not match candidate')

    if preview.get('verified') is not True:
        raise PromotionDenied('preview verification is not proven')
    if preview.get('commit_sha')!=candidate:
        raise PromotionDenied('preview commit does not match candidate')
    if not preview.get('deployment_id'):
        raise PromotionDenied('preview deployment id missing')

    if migration.get('status') not in {'passed','not_applicable'}:
        raise PromotionDenied('migration gate not passed')
    if migration.get('commit_sha')!=candidate:
        raise PromotionDenied('migration gate commit does not match candidate')

    if security.get('status')!='passed':
        raise PromotionDenied('security/browser smoke not passed')
    if security.get('commit_sha')!=candidate:
        raise PromotionDenied('security smoke commit does not match candidate')

    if target.get('team_id')!=canonical['vercel_team_id']:
        raise PromotionDenied('production team mismatch')
    if target.get('project_id')!=canonical['vercel_project_id']:
        raise PromotionDenied('production project mismatch')
    if target.get('environment')!='production':
        raise PromotionDenied('target environment is not production')
    if target.get('state')!='READY':
        raise PromotionDenied('production deployment is not READY')
    if target.get('commit_sha')!=candidate:
        raise PromotionDenied('production deployment commit does not match candidate')
    if not target.get('deployment_id'):
        raise PromotionDenied('production deployment id missing')

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('evidence',type=Path)
    args=ap.parse_args()
    policy=json.loads(POLICY_PATH.read_text(encoding='utf-8'))
    evidence=json.loads(args.evidence.read_text(encoding='utf-8'))
    verify(evidence,policy)
    print('C03_PROMOTION_EVIDENCE_PASS: production promotion evidence matches canonical repo/branch/project and all prerequisite commit-aligned gates')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
