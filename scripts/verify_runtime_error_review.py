#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from datetime import datetime,timezone
from pathlib import Path
from typing import Any
ROOT=Path(__file__).resolve().parents[1]
POLICY=json.loads((ROOT/'data/runtime-error-review-policy.json').read_text(encoding='utf-8'))
class RuntimeReviewDenied(AssertionError): pass
def need(c:bool,m:str)->None:
    if not c: raise RuntimeReviewDenied(m)
def ts(v:Any,label:str)->datetime:
    need(isinstance(v,str) and v,label+' missing')
    try: d=datetime.fromisoformat(v.replace('Z','+00:00'))
    except ValueError as exc: raise RuntimeReviewDenied(label+' invalid') from exc
    need(d.tzinfo is not None,label+' must be timezone-aware')
    return d.astimezone(timezone.utc)
def verify(e:dict[str,Any],p:dict[str,Any]=POLICY)->None:
    dep=e.get('deployment'); window=e.get('window'); clusters=e.get('clusters')
    need(isinstance(dep,dict),'deployment evidence missing')
    need(dep.get('project_id')==p['canonical']['project_id'],'project mismatch')
    need(dep.get('environment')=='production','environment mismatch')
    need(dep.get('state')=='READY','deployment not READY')
    need(bool(dep.get('deployment_id')),'deployment id missing')
    need(bool(dep.get('commit_sha')),'deployment commit missing')
    need(e.get('source')==p['source_required'],'runtime log source mismatch')
    need(e.get('c07',{}).get('status')=='passed','C07 not passed')
    need(e['c07'].get('commit_sha')==dep.get('commit_sha'),'C07 commit mismatch')
    need(e['c07'].get('deployment_id')==dep.get('deployment_id'),'C07 deployment mismatch')
    need(e.get('r09',{}).get('status')=='passed','R09 not passed')
    need(e.get('redaction_attested') is True,'runtime log redaction not attested')
    need(isinstance(window,dict),'acceptance window missing')
    start,end=ts(window.get('start'),'window start'),ts(window.get('end'),'window end')
    need(end>start,'acceptance window order invalid')
    minutes=(end-start).total_seconds()/60
    need(minutes>=p['acceptance']['minimum_window_minutes'],'acceptance window too short')
    need(isinstance(clusters,list),'clusters missing')
    unresolved={"P0":0,"P1":0}
    forbidden={x.lower() for x in p['forbidden_cluster_fields']}
    for row in clusters:
        need(isinstance(row,dict),'invalid cluster row')
        sev=row.get('severity'); need(sev in p['severity'],'invalid severity')
        need(bool(row.get('fingerprint') or row.get('request_id')),'cluster correlation missing')
        keys={str(k).lower() for k in row.keys()}
        leaked=sorted(keys & forbidden); need(not leaked,'cluster contains forbidden fields: '+','.join(leaked))
        need(isinstance(row.get('count'),int) and row['count']>0,'cluster count invalid')
        first,last=ts(row.get('first_seen'),'cluster first_seen'),ts(row.get('last_seen'),'cluster last_seen')
        need(start<=first<=last<=end,'cluster timestamps outside acceptance window')
        if sev in unresolved and row.get('resolved') is not True: unresolved[sev]+=1
        if row.get('resolved') is True:
            need(bool(row.get('resolution')),'resolved cluster missing resolution evidence')
    need(unresolved['P0']<=p['acceptance']['unresolved_p0_max'],'unresolved P0 clusters present')
    need(unresolved['P1']<=p['acceptance']['unresolved_p1_max'],'unresolved P1 clusters present')
def main()->int:
    ap=argparse.ArgumentParser(); ap.add_argument('evidence',type=Path); a=ap.parse_args()
    verify(json.loads(a.evidence.read_text(encoding='utf-8')))
    print('C08_RUNTIME_ERROR_REVIEW_PASS: exact production window contains no unresolved P0/P1 clusters and redaction/correlation evidence is present')
    return 0
if __name__=='__main__': raise SystemExit(main())
