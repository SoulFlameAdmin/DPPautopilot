from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('c10',ROOT/'scripts/verify_security_acceptance.py')
MOD=importlib.util.module_from_spec(SPEC); assert SPEC and SPEC.loader; SPEC.loader.exec_module(MOD)
POLICY=json.loads((ROOT/'data/security-acceptance-policy.json').read_text(encoding='utf-8'))

def good():
    sha='abc1234567890'
    controls={t:{'status':'passed','evidence_ref':f'evidence:{t}'} for t in POLICY['required_security_tasks']}
    return {
      'candidate_commit_sha':sha,
      'c07':{'status':'passed','commit_sha':sha,'deployment_id':'dpl-prod-1','project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr','environment':'production'},
      'security_tasks':controls,
      'repository_security_hygiene':'passed',
      'live_production_security':'passed',
      'live_commit_sha':sha,
      'live_deployment_id':'dpl-prod-1',
      'issues':[
        {'id':'SEC-001','severity':'medium','status':'open','summary':'tracked medium finding'},
        {'id':'SEC-002','severity':'high','status':'resolved','summary':'resolved high finding','resolution_evidence':'run:123'}
      ],
      'inventory_attestation':{'complete':True,'evidence_ref':'security-review:full'}
    }

class SecurityAcceptanceTests(unittest.TestCase):
    def test_accepts_complete_zero_open_critical_high(self):
        MOD.verify(good(),POLICY)

    def test_rejects_missing_or_failed_security_task(self):
        e=good();del e['security_tasks']['R04']
        with self.assertRaisesRegex(MOD.SecurityAcceptanceDenied,'security tasks missing: R04'): MOD.verify(e,POLICY)
        e=good();e['security_tasks']['R06']['status']='failed'
        with self.assertRaisesRegex(MOD.SecurityAcceptanceDenied,'R06 not passed'): MOD.verify(e,POLICY)

    def test_rejects_c07_or_live_deployment_drift(self):
        e=good();e['c07']['commit_sha']='wrong'
        with self.assertRaisesRegex(MOD.SecurityAcceptanceDenied,'C07 commit mismatch'): MOD.verify(e,POLICY)
        e=good();e['live_deployment_id']='other'
        with self.assertRaisesRegex(MOD.SecurityAcceptanceDenied,'live security deployment mismatch'): MOD.verify(e,POLICY)

    def test_rejects_open_critical_or_high(self):
        for sev in ['critical','high']:
            e=good();e['issues'].append({'id':'SEC-X','severity':sev,'status':'open','summary':'open severe finding'})
            with self.assertRaisesRegex(MOD.SecurityAcceptanceDenied,'unresolved '+sev): MOD.verify(e,POLICY)

    def test_rejects_silent_or_incomplete_inventory(self):
        e=good();e['inventory_attestation']['complete']=False
        with self.assertRaisesRegex(MOD.SecurityAcceptanceDenied,'not attested complete'): MOD.verify(e,POLICY)
        e=good();e['issues'][0].pop('summary')
        with self.assertRaisesRegex(MOD.SecurityAcceptanceDenied,'summary missing'): MOD.verify(e,POLICY)

    def test_rejects_resolved_issue_without_evidence(self):
        e=good();e['issues'][1].pop('resolution_evidence')
        with self.assertRaisesRegex(MOD.SecurityAcceptanceDenied,'resolution evidence'): MOD.verify(e,POLICY)

if __name__=='__main__':
    unittest.main()
