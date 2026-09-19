#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PATTERN=re.compile(r'^(\d{14})_([a-z0-9_]+)\.sql$')

def build_manifest(commit_sha:str)->dict:
    root=ROOT/'supabase/migrations'
    rows=[]
    for path in sorted(root.glob('*.sql')):
        match=PATTERN.match(path.name)
        if not match:
            raise AssertionError(f'invalid migration filename: {path.name}')
        body=path.read_bytes()
        rows.append({
            'filename':path.name,
            'filename_version':match.group(1),
            'name':match.group(2),
            'sha256':hashlib.sha256(body).hexdigest(),
        })
    names=[r['name'] for r in rows]
    if len(names)!=len(set(names)):
        raise AssertionError('duplicate migration canonical name')
    payload={'schema_version':1,'commit_sha':commit_sha,'migrations':rows}
    canonical=json.dumps(payload,sort_keys=True,separators=(',',':')).encode()
    payload['manifest_sha256']=hashlib.sha256(canonical).hexdigest()
    return payload

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--commit',required=True)
    ap.add_argument('--output',type=Path,default=ROOT/'artifacts/c04-migration-manifest.json')
    args=ap.parse_args()
    manifest=build_manifest(args.commit)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(f"C04_MIGRATION_MANIFEST_PASS: {len(manifest['migrations'])} migrations; sha256={manifest['manifest_sha256']}")
    return 0

if __name__=='__main__':
    raise SystemExit(main())
