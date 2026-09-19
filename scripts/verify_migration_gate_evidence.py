#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY=json.loads((ROOT/'data/migration-deployment-gate-policy.json').read_text(encoding='utf-8'))

class MigrationGateDenied(AssertionError):
    pass

def verify(evidence:dict[str,Any],policy:dict[str,Any]=POLICY)->None:
    candidate=evidence.get('candidate_commit_sha')
    if not isinstance(candidate,str) or len(candidate)<7:
        raise MigrationGateDenied('candidate commit missing')
    manifest=evidence.get('manifest')
    database=evidence.get('database')
    schema=evidence.get('schema_verification')
    if not isinstance(manifest,dict): raise MigrationGateDenied('manifest evidence missing')
    if not isinstance(database,dict): raise MigrationGateDenied('database evidence missing')
    if not isinstance(schema,dict): raise MigrationGateDenied('schema verification evidence missing')
    if manifest.get('commit_sha')!=candidate:
        raise MigrationGateDenied('manifest commit does not match candidate')
    rows=manifest.get('migrations')
    if not isinstance(rows,list) or not rows:
        raise MigrationGateDenied('migration manifest is empty')
    claimed=manifest.get('manifest_sha256')
    core={'schema_version':manifest.get('schema_version'),'commit_sha':manifest.get('commit_sha'),'migrations':rows}
    actual=hashlib.sha256(json.dumps(core,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if claimed!=actual:
        raise MigrationGateDenied('migration manifest checksum mismatch')
    names=[]
    for row in rows:
        if not isinstance(row,dict) or not row.get('name') or not row.get('sha256'):
            raise MigrationGateDenied('migration manifest row incomplete')
        if len(row['sha256'])!=64:
            raise MigrationGateDenied('migration file checksum invalid')
        names.append(row['name'])
    if len(names)!=len(set(names)):
        raise MigrationGateDenied('duplicate migration name in manifest')
    if database.get('project_id')!=policy['bound_project_id']:
        raise MigrationGateDenied('database project mismatch')
    applied=database.get('applied_migration_names')
    if not isinstance(applied,list):
        raise MigrationGateDenied('applied migration names missing')
    missing=sorted(set(names)-set(applied))
    if missing:
        raise MigrationGateDenied('database missing migrations: '+','.join(missing))
    if schema.get('status')!='passed':
        raise MigrationGateDenied('schema verification not passed')
    if schema.get('commit_sha')!=candidate:
        raise MigrationGateDenied('schema verification commit does not match candidate')

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('evidence',type=Path)
    args=ap.parse_args()
    verify(json.loads(args.evidence.read_text(encoding='utf-8')))
    print('C04_MIGRATION_GATE_EVIDENCE_PASS: exact release manifest, bound migration coverage and commit-aligned schema verification pass')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
