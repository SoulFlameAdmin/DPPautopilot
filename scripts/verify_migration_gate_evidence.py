#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json,os,re
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY=json.loads((ROOT/'data/migration-deployment-gate-policy.json').read_text(encoding='utf-8'))

class MigrationGateDenied(AssertionError):
    pass

def verify(evidence:dict[str,Any],policy:dict[str,Any]=POLICY,*,expected_commit_sha:str|None=None)->None:
    candidate=evidence.get('candidate_commit_sha')
    if not isinstance(candidate,str) or not re.fullmatch(r'[0-9a-f]{40}',candidate):
        raise MigrationGateDenied('candidate commit must be an exact 40-character Git SHA')
    if expected_commit_sha is not None:
        if not re.fullmatch(r'[0-9a-f]{40}',expected_commit_sha):
            raise MigrationGateDenied('trusted expected commit must be an exact 40-character Git SHA')
        if candidate!=expected_commit_sha:
            raise MigrationGateDenied('candidate commit does not match trusted release commit')
    manifest=evidence.get('manifest')
    database=evidence.get('database')
    schema=evidence.get('schema_verification')
    if not isinstance(manifest,dict): raise MigrationGateDenied('manifest evidence missing')
    if not isinstance(database,dict): raise MigrationGateDenied('database evidence missing')
    if not isinstance(schema,dict): raise MigrationGateDenied('schema verification evidence missing')
    if type(manifest.get('schema_version')) is not int or manifest['schema_version']!=1:
        raise MigrationGateDenied('unsupported migration manifest schema_version')
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
    # Never trust a self-consistent manifest alone. Recompute each file hash from
    # this exact checked-out source and require complete, non-extra coverage.
    source_dir=ROOT/'supabase/migrations'
    expected_files={p.name:p for p in source_dir.glob('*.sql')}
    listed_files=set()
    for row in rows:
        filename=row.get('filename')
        if not isinstance(filename,str) or filename not in expected_files:
            raise MigrationGateDenied('manifest references missing source migration file')
        parsed=re.fullmatch(r'(\d{14})_([a-z0-9_]+)\.sql',filename)
        if not parsed or row.get('filename_version')!=parsed.group(1) or row.get('name')!=parsed.group(2):
            raise MigrationGateDenied('manifest migration name/version do not match source filename')
        if filename in listed_files:
            raise MigrationGateDenied('duplicate migration filename in manifest')
        listed_files.add(filename)
        actual_sha=hashlib.sha256(expected_files[filename].read_bytes()).hexdigest()
        if row.get('sha256')!=actual_sha:
            raise MigrationGateDenied('manifest migration file SHA256 does not match checked-out source')
    if listed_files!=set(expected_files):
        raise MigrationGateDenied('manifest does not cover every repository migration file')
    if database.get('project_id')!=policy['bound_project_id']:
        raise MigrationGateDenied('database project mismatch')
    applied=database.get('applied_migration_names')
    if not isinstance(applied,list):
        raise MigrationGateDenied('applied migration names missing')
    if any(not isinstance(name,str) or not name for name in applied):
        raise MigrationGateDenied('applied migration names must be nonempty strings')
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
    ap.add_argument('--expected-commit',help='Trusted release commit SHA when GITHUB_SHA is unavailable')
    args=ap.parse_args()
    github_sha=os.environ.get('GITHUB_SHA')
    if github_sha and args.expected_commit and github_sha!=args.expected_commit:
        raise MigrationGateDenied('explicit expected commit conflicts with trusted GITHUB_SHA')
    expected=github_sha or args.expected_commit
    if not expected:
        raise MigrationGateDenied('trusted release commit required (--expected-commit or GITHUB_SHA)')
    verify(json.loads(args.evidence.read_text(encoding='utf-8')),expected_commit_sha=expected)
    print('C04_MIGRATION_GATE_EVIDENCE_PASS: exact release manifest, bound migration coverage and commit-aligned schema verification pass')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
