#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT=Path(__file__).resolve().parents[1]
POLICY=json.loads((ROOT/'data/privacy-compliance-acceptance-policy.json').read_text(encoding='utf-8'))

class PrivacyComplianceDenied(AssertionError):
    pass

def need(condition:bool,message:str)->None:
    if not condition:
        raise PrivacyComplianceDenied(message)

def verify(e:dict[str,Any],p:dict[str,Any]=POLICY)->None:
    deps=e.get('dependencies')
    need(isinstance(deps,dict),'dependency evidence missing')
    for dep in p['dependencies']:
        row=deps.get(dep)
        need(isinstance(row,dict),dep+' evidence missing')
        need(row.get('status')=='passed',dep+' not passed')
        need(bool(row.get('evidence_ref')),dep+' evidence reference missing')

    trace=e.get('traceability')
    privacy=e.get('privacy_inventory')
    retention=e.get('retention_deletion_export')
    recipients=e.get('external_recipients')
    claims=e.get('claims_review')
    for name,obj in [
        ('traceability',trace),
        ('privacy inventory',privacy),
        ('retention/deletion/export',retention),
        ('external recipients',recipients),
        ('claims review',claims),
    ]:
        need(isinstance(obj,dict),name+' evidence missing')

    need(trace.get('catalog_coverage')==1.0,'traceability catalog coverage incomplete')
    need(trace.get('authoritative_sources_complete') is True,'traceability source mapping incomplete')

    need(privacy.get('inventory_complete') is True,'privacy inventory incomplete')
    need(privacy.get('all_dpp_tables_covered') is True,'privacy inventory table coverage incomplete')
    need(privacy.get('processors_recipients_complete') is True,'processor/recipient inventory incomplete')

    need(retention.get('policy_complete') is True,'retention policy incomplete')
    need(retention.get('deletion_export_tests_passed') is True,'deletion/export tests not passed')
    need(retention.get('evidence_object_lifecycle_verified') is True,'evidence object lifecycle not verified')
    need(retention.get('auth_account_lifecycle_verified') is True,'auth account lifecycle not verified')
    need(retention.get('organization_deletion_ready') is True,'organization deletion not ready')

    need(recipients.get('scope_reviewed') is True,'external recipient scope not reviewed')
    need(recipients.get('terms_accepted_or_no_live_transfer') is True,'external recipient terms/live-transfer boundary unresolved')

    need(claims.get('review_complete') is True,'compliance claim review incomplete')
    need(claims.get('unsupported_claims_count')==0,'unsupported compliance claims remain')
    reviewed=claims.get('reviewed_paths')
    need(isinstance(reviewed,list) and reviewed,'compliance claim reviewed paths missing')
    need(claims.get('legal_signoff_claimed') is False,'C11 must not claim legal sign-off')

    att=e.get('review_attestation')
    need(isinstance(att,dict),'privacy/compliance review attestation missing')
    need(att.get('complete') is True,'privacy/compliance review not attested complete')
    need(bool(att.get('evidence_ref')),'privacy/compliance attestation evidence missing')

def main()->int:
    ap=argparse.ArgumentParser()
    ap.add_argument('evidence',type=Path)
    args=ap.parse_args()
    verify(json.loads(args.evidence.read_text(encoding='utf-8')))
    print('C11_PRIVACY_COMPLIANCE_ACCEPTANCE_PASS: F11/R07/R08 evidence, traceability, privacy inventory, lifecycle/recipient decisions and zero unsupported claims pass; legal sign-off remains separate')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
