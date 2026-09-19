from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('staging',ROOT/'scripts/verify_staging_acceptance.py')
MOD=importlib.util.module_from_spec(SPEC); assert SPEC and SPEC.loader; SPEC.loader.exec_module(MOD)
POLICY=json.loads((ROOT/'data/staging-acceptance-policy.json').read_text(encoding='utf-8'))

def good():
    sha='abc1234567890'
    return {
      'candidate_commit_sha':sha,
      'preview':{
        'verified':True,
        'project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr',
        'environment':'preview','state':'READY','commit_sha':sha,
        'deployment_id':'dpl_preview_1','url':'https://preview.example.invalid'
      },
      'regression':{
        'status':'passed','commit_sha':sha,'clean_checkout':True,
        'suites':['T01','T02','T03','T04','T05','T06','T07','T08','T09']
      },
      'environment_config':{
        'production_like':True,
        'uses_production_customer_data':False,
        'uses_production_database':False,
        'data_classification':'synthetic'
      },
      'migration_schema':{'status':'passed','commit_sha':sha},
      'smoke':{
        'status':'passed','commit_sha':sha,'security_headers':'passed',
        'core_routes':[
          {'path':'/','status':200},
          {'path':'/data/master-plan.json','status':200},
          {'path':'/api/models','status':401}
        ]
      }
    }

class StagingAcceptanceTests(unittest.TestCase):
    def test_accepts_complete_exact_candidate_evidence(self):
        MOD.verify(good(),POLICY)

    def test_rejects_wrong_preview_project_or_state(self):
        e=good();e['preview']['project_id']='wrong'
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'project mismatch'): MOD.verify(e,POLICY)
        e=good();e['preview']['state']='BUILDING'
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'not READY'): MOD.verify(e,POLICY)

    def test_rejects_commit_drift(self):
        e=good();e['regression']['commit_sha']='wrong'
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'regression commit mismatch'): MOD.verify(e,POLICY)
        e=good();e['smoke']['commit_sha']='wrong'
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'smoke commit mismatch'): MOD.verify(e,POLICY)

    def test_rejects_incomplete_mandatory_suite(self):
        e=good();e['regression']['suites'].remove('T06')
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'mandatory suites missing: T06'): MOD.verify(e,POLICY)

    def test_rejects_production_data_or_database(self):
        e=good();e['environment_config']['uses_production_customer_data']=True
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'production customer data forbidden'): MOD.verify(e,POLICY)
        e=good();e['environment_config']['uses_production_database']=True
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'production database forbidden'): MOD.verify(e,POLICY)

    def test_rejects_unverified_headers_or_too_few_routes(self):
        e=good();e['smoke']['security_headers']='failed'
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'security headers not passed'): MOD.verify(e,POLICY)
        e=good();e['smoke']['core_routes']=e['smoke']['core_routes'][:2]
        with self.assertRaisesRegex(MOD.StagingAcceptanceDenied,'insufficient core-route'): MOD.verify(e,POLICY)

if __name__=='__main__':
    unittest.main()
