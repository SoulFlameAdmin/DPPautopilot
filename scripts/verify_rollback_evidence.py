#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY=json.loads((ROOT/'data/rollback-procedure-policy.json').read_text(encoding='utf-8'))

class RollbackDenied(AssertionError):
    pass

def need(condition:bool,message:str)->None:
    if not condition:
        raise RollbackDenied(message)

def verify_common(e:dict[str,Any],policy:dict[str,Any])->tuple[dict[str,Any],dict[str,Any]]:
    current=e.get('current_release')
    need(isinstance(current,dict),'current release missing')
    need(current.get('source_repo')==policy['canonical']['source_repo'],'current source repo mismatch')
    need(current.get('source_branch')==policy['canonical']['source_branch'],'current source branch mismatch')
    need(current.get('vercel_project_id')==policy['canonical']['vercel_project_id'],'current Vercel project mismatch')
    need(isinstance(current.get('commit_sha'),str) and len(current['commit_sha'])>=7,'current commit missing')
    action=e.get('action')
    need(isinstance(action,dict),'rollback action missing')
    return current,action

def verify(evidence:dict[str,Any],policy:dict[str,Any]=POLICY)->str:
    current,action=verify_common(evidence,policy)
    strategy=action.get('strategy')
    trigger=action.get('trigger')
    need(strategy in policy['strategies'],'unknown rollback strategy')
    spec=policy['strategies'][strategy]
    need(trigger in spec['allowed_triggers'],'trigger not allowed for rollback strategy')

    if strategy=='application_rollback':
        target=action.get('target_release')
        compat=action.get('schema_compatibility')
        verification=action.get('target_verification')
        need(isinstance(target,dict),'target release missing')
        need(target.get('vercel_project_id')==policy['canonical']['vercel_project_id'],'rollback target project mismatch')
        need(target.get('state')=='READY','rollback target not READY')
        need(target.get('immutable') is True,'rollback target not immutable')
        need(target.get('last_known_good') is True,'rollback target not last-known-good')
        need(target.get('commit_sha')!=current.get('commit_sha'),'rollback target equals failing commit')
        need(isinstance(verification,dict) and verification.get('status')=='passed','target verification not passed')
        need(verification.get('commit_sha')==target.get('commit_sha'),'target verification commit mismatch')
        need(isinstance(compat,dict) and compat.get('status')=='compatible','target schema compatibility not proven')
        need(compat.get('target_commit_sha')==target.get('commit_sha'),'schema compatibility target mismatch')
        need(compat.get('active_schema_manifest_sha256')==evidence.get('active_schema_manifest_sha256'),'active schema evidence mismatch')
        need(action.get('database_mutation') is False,'application rollback must not mutate database')
        return strategy

    if strategy=='forward_fix':
        ff=action.get('forward_fix')
        gate=action.get('migration_gate')
        schema=action.get('isolated_schema_verification')
        need(isinstance(ff,dict),'forward-fix evidence missing')
        need(ff.get('candidate_commit_sha')!=current.get('commit_sha'),'forward-fix commit equals failing commit')
        need(ff.get('migration_plan_status')=='tested','forward-fix migration plan not tested')
        need(isinstance(gate,dict) and gate.get('status')=='passed','C04 migration gate not passed')
        need(gate.get('commit_sha')==ff.get('candidate_commit_sha'),'migration gate commit mismatch')
        need(isinstance(schema,dict) and schema.get('status')=='passed','isolated schema verification not passed')
        need(schema.get('commit_sha')==ff.get('candidate_commit_sha'),'schema verification commit mismatch')
        need(action.get('destructive_database_rollback') is False,'destructive database rollback forbidden')
        return strategy

    if strategy=='isolated_restore_then_recover':
        backup=action.get('backup')
        restore=action.get('isolated_restore')
        boundary=action.get('data_loss_boundary')
        storage=action.get('storage_recovery')
        need(isinstance(backup,dict),'backup evidence missing')
        need(bool(backup.get('backup_id')),'backup id missing')
        need(bool(backup.get('recovery_point')),'backup recovery point missing')
        need(isinstance(restore,dict) and restore.get('status')=='passed','isolated restore not passed')
        for check in ['schema','relations','rls','binding']:
            need(restore.get('integrity',{}).get(check) is True,f'isolated restore integrity missing: {check}')
        need(isinstance(boundary,dict) and boundary.get('documented') is True,'data-loss boundary not documented')
        need(isinstance(storage,dict) and storage.get('status') in {'verified','known_gap'},'storage recovery state unknown')
        need(action.get('direct_production_restore') is False,'direct production restore forbidden')
        need(action.get('production_recovery_authorized') is True,'production recovery authorization missing')
        return strategy

    raise RollbackDenied('unsupported rollback strategy')

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('evidence',type=Path)
    args=ap.parse_args()
    strategy=verify(json.loads(args.evidence.read_text(encoding='utf-8')))
    print(f'C05_ROLLBACK_EVIDENCE_PASS: fail-closed strategy={strategy} evidence is internally consistent')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
