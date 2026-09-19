#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from datetime import datetime,timezone
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY=json.loads((ROOT/'data/production-smoke-policy.json').read_text(encoding='utf-8'))

class ProductionSmokeDenied(AssertionError):
    pass

def need(condition:bool,message:str)->None:
    if not condition:
        raise ProductionSmokeDenied(message)

def parse_ts(value:Any,label:str)->datetime:
    need(isinstance(value,str) and value,label+' timestamp missing')
    try:
        dt=datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError as exc:
        raise ProductionSmokeDenied(label+' timestamp invalid') from exc
    need(dt.tzinfo is not None,label+' timestamp must be timezone-aware')
    return dt.astimezone(timezone.utc)

def lower_headers(row:dict[str,Any])->dict[str,str]:
    headers=row.get('headers')
    need(isinstance(headers,dict),'headers evidence missing')
    return {str(k).lower():str(v) for k,v in headers.items()}

def require_security_headers(row:dict[str,Any],policy:dict[str,Any])->None:
    headers=lower_headers(row)
    missing=[h for h in policy['global_security_headers'] if h not in headers]
    need(not missing,'security headers missing: '+','.join(missing))

def verify(e:dict[str,Any],policy:dict[str,Any]=POLICY)->None:
    candidate=e.get('candidate_commit_sha')
    need(isinstance(candidate,str) and len(candidate)>=7,'candidate commit missing')
    deployment=e.get('deployment')
    gates=e.get('release_gates')
    checks=e.get('checks')
    need(isinstance(deployment,dict),'deployment evidence missing')
    need(isinstance(gates,dict),'release gate evidence missing')
    need(isinstance(checks,dict),'smoke checks missing')

    canonical=policy['canonical']
    need(deployment.get('team_id')==canonical['vercel_team_id'],'production team mismatch')
    need(deployment.get('project_id')==canonical['vercel_project_id'],'production project mismatch')
    need(deployment.get('environment')==canonical['environment'],'environment is not production')
    need(deployment.get('state')=='READY','production deployment not READY')
    need(deployment.get('commit_sha')==candidate,'production deployment commit mismatch')
    need(bool(deployment.get('deployment_id')),'production deployment id missing')
    need(str(deployment.get('url','')).startswith('https://'),'production URL must use HTTPS')
    need(deployment.get('tls_verified') is True,'production TLS not verified')

    ready_at=parse_ts(deployment.get('ready_at'),'deployment ready')
    observed_at=parse_ts(e.get('observed_at'),'smoke observed')
    need(observed_at>=ready_at,'smoke predates deployment readiness')

    for gate in ['C03','C06']:
        row=gates.get(gate)
        need(isinstance(row,dict),gate+' evidence missing')
        need(row.get('status')=='passed',gate+' not passed')
        need(row.get('commit_sha')==candidate,gate+' commit mismatch')

    need(set(policy['required_checks']).issubset(checks), 'required production smoke checks missing')

    home=checks['home']
    need(home.get('status')==200,'home smoke failed')
    need('dpp' in str(home.get('body_marker','')).lower(),'home DPP marker missing')
    require_security_headers(home,policy)

    auth=checks['auth_ui']
    need(auth.get('status')==200,'auth UI smoke failed')
    need(auth.get('route')=='/demo/auth.html','auth UI route mismatch')
    require_security_headers(auth,policy)

    api=checks['core_api_auth_boundary']
    need(api.get('route')=='/api/models','core API route mismatch')
    need(api.get('status')==401,'protected core API must reject anonymous request')
    need(api.get('error_code')=='AUTH_REQUIRED','core API auth error mismatch')
    headers=lower_headers(api)
    need('x-request-id' in headers,'core API request correlation header missing')
    require_security_headers(api,policy)

    passport=checks['public_passport']
    need(passport.get('status')==200,'public passport smoke failed')
    need(str(passport.get('route','')).startswith('/api/passport'),'public passport API route mismatch')
    need(bool(passport.get('identifier')),'public passport identifier missing')
    payload=passport.get('payload')
    need(isinstance(payload,dict),'public passport payload missing')
    need(payload.get('identifier')==passport.get('identifier'),'public passport identifier mismatch')
    text=json.dumps(payload,sort_keys=True).lower()
    leaked=[k for k in policy['public_passport_forbidden_keys'] if f'"{k.lower()}"' in text]
    need(not leaked,'public passport leaked forbidden keys: '+','.join(leaked))
    require_security_headers(passport,policy)

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('evidence',type=Path)
    args=ap.parse_args()
    verify(json.loads(args.evidence.read_text(encoding='utf-8')))
    print('C07_PRODUCTION_SMOKE_EVIDENCE_PASS: READY production identity, timestamp, TLS, release gates and home/auth/API/public-passport smoke checks align')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
