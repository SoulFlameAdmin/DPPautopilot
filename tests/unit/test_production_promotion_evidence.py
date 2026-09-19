from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('promotion_verify',ROOT/'scripts/verify_production_promotion_evidence.py')
MOD=importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MOD)
POLICY=json.loads((ROOT/'data/production-promotion-policy.json').read_text(encoding='utf-8'))

def good():
    sha='abcdef1234567890'
    return {
        'source_repo':'SoulFlameAdmin/DPPautopilot',
        'source_branch':'main',
        'candidate_commit_sha':sha,
        'ci':{'status':'success','commit_sha':sha},
        'preview':{'verified':True,'commit_sha':sha,'deployment_id':'dpl_preview'},
        'migration_gate':{'status':'passed','commit_sha':sha},
        'security_smoke':{'status':'passed','commit_sha':sha},
        'production_target':{
            'team_id':'team_cKaIZfnCMzoiiq80J0MhV0A2',
            'project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr',
            'environment':'production',
            'state':'READY',
            'commit_sha':sha,
            'deployment_id':'dpl_prod',
        },
    }

class PromotionEvidenceTests(unittest.TestCase):
    def test_accepts_exact_gate_aligned_evidence(self):
        MOD.verify(good(),POLICY)

    def test_rejects_non_main_source(self):
        e=good();e['source_branch']='feature/x'
        with self.assertRaisesRegex(MOD.PromotionDenied,'must be main'):
            MOD.verify(e,POLICY)

    def test_rejects_preview_or_ci_commit_drift(self):
        e=good();e['preview']['commit_sha']='deadbeef'
        with self.assertRaisesRegex(MOD.PromotionDenied,'preview commit'):
            MOD.verify(e,POLICY)
        e=good();e['ci']['commit_sha']='deadbeef'
        with self.assertRaisesRegex(MOD.PromotionDenied,'CI commit'):
            MOD.verify(e,POLICY)

    def test_rejects_missing_migration_or_security_gate(self):
        e=good();e['migration_gate']['status']='pending'
        with self.assertRaisesRegex(MOD.PromotionDenied,'migration gate'):
            MOD.verify(e,POLICY)
        e=good();e['security_smoke']['status']='failed'
        with self.assertRaisesRegex(MOD.PromotionDenied,'security/browser'):
            MOD.verify(e,POLICY)

    def test_rejects_wrong_production_target_or_state(self):
        e=good();e['production_target']['project_id']='prj_wrong'
        with self.assertRaisesRegex(MOD.PromotionDenied,'project mismatch'):
            MOD.verify(e,POLICY)
        e=good();e['production_target']['state']='BUILDING'
        with self.assertRaisesRegex(MOD.PromotionDenied,'not READY'):
            MOD.verify(e,POLICY)

    def test_allows_explicit_no_migration_case_but_not_commit_drift(self):
        e=good();e['migration_gate']['status']='not_applicable'
        MOD.verify(e,POLICY)
        e['migration_gate']['commit_sha']='deadbeef'
        with self.assertRaisesRegex(MOD.PromotionDenied,'migration gate commit'):
            MOD.verify(e,POLICY)

if __name__=='__main__':
    unittest.main()
