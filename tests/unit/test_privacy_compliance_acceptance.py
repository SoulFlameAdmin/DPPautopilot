from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('c11',ROOT/'scripts/verify_privacy_compliance_acceptance.py')
MOD=importlib.util.module_from_spec(SPEC); assert SPEC and SPEC.loader; SPEC.loader.exec_module(MOD)
POLICY=json.loads((ROOT/'data/privacy-compliance-acceptance-policy.json').read_text(encoding='utf-8'))

def good():
    return {
      'dependencies':{
        'F11':{'status':'passed','evidence_ref':'traceability:1'},
        'R07':{'status':'passed','evidence_ref':'privacy:1'},
        'R08':{'status':'passed','evidence_ref':'retention:1'}
      },
      'traceability':{'catalog_coverage':1.0,'authoritative_sources_complete':True},
      'privacy_inventory':{'inventory_complete':True,'all_dpp_tables_covered':True,'processors_recipients_complete':True},
      'retention_deletion_export':{
        'policy_complete':True,'deletion_export_tests_passed':True,
        'evidence_object_lifecycle_verified':True,'auth_account_lifecycle_verified':True,
        'organization_deletion_ready':True
      },
      'external_recipients':{'scope_reviewed':True,'terms_accepted_or_no_live_transfer':True},
      'claims_review':{
        'review_complete':True,'unsupported_claims_count':0,
        'reviewed_paths':['index.html','demo/','docs/'],'legal_signoff_claimed':False
      },
      'review_attestation':{'complete':True,'evidence_ref':'review:current-scope'}
    }

class PrivacyComplianceAcceptanceTests(unittest.TestCase):
    def test_accepts_complete_nonlegal_review(self):
        MOD.verify(good(),POLICY)

    def test_rejects_red_dependency(self):
        e=good();e['dependencies']['R08']['status']='partial'
        with self.assertRaisesRegex(MOD.PrivacyComplianceDenied,'R08 not passed'): MOD.verify(e,POLICY)

    def test_rejects_incomplete_lifecycle(self):
        e=good();e['retention_deletion_export']['evidence_object_lifecycle_verified']=False
        with self.assertRaisesRegex(MOD.PrivacyComplianceDenied,'object lifecycle'): MOD.verify(e,POLICY)
        e=good();e['retention_deletion_export']['auth_account_lifecycle_verified']=False
        with self.assertRaisesRegex(MOD.PrivacyComplianceDenied,'auth account lifecycle'): MOD.verify(e,POLICY)

    def test_rejects_unresolved_external_recipient(self):
        e=good();e['external_recipients']['terms_accepted_or_no_live_transfer']=False
        with self.assertRaisesRegex(MOD.PrivacyComplianceDenied,'boundary unresolved'): MOD.verify(e,POLICY)

    def test_rejects_unsupported_claims_or_legal_signoff_claim(self):
        e=good();e['claims_review']['unsupported_claims_count']=1
        with self.assertRaisesRegex(MOD.PrivacyComplianceDenied,'unsupported compliance claims'): MOD.verify(e,POLICY)
        e=good();e['claims_review']['legal_signoff_claimed']=True
        with self.assertRaisesRegex(MOD.PrivacyComplianceDenied,'must not claim legal sign-off'): MOD.verify(e,POLICY)

    def test_rejects_incomplete_traceability_or_inventory(self):
        e=good();e['traceability']['catalog_coverage']=0.99
        with self.assertRaisesRegex(MOD.PrivacyComplianceDenied,'coverage incomplete'): MOD.verify(e,POLICY)
        e=good();e['privacy_inventory']['all_dpp_tables_covered']=False
        with self.assertRaisesRegex(MOD.PrivacyComplianceDenied,'table coverage incomplete'): MOD.verify(e,POLICY)

if __name__=='__main__':
    unittest.main()
