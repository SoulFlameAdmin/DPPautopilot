from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('rollback',ROOT/'scripts/verify_rollback_evidence.py')
MOD=importlib.util.module_from_spec(SPEC); assert SPEC and SPEC.loader; SPEC.loader.exec_module(MOD)
POLICY=json.loads((ROOT/'data/rollback-procedure-policy.json').read_text(encoding='utf-8'))

CURRENT={
  'source_repo':'SoulFlameAdmin/DPPautopilot',
  'source_branch':'main',
  'vercel_project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr',
  'commit_sha':'badcafe123456789'
}

def app_good():
    return {
      'current_release':dict(CURRENT),
      'active_schema_manifest_sha256':'a'*64,
      'action':{
        'strategy':'application_rollback',
        'trigger':'application_regression',
        'database_mutation':False,
        'target_release':{
          'vercel_project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr',
          'state':'READY','immutable':True,'last_known_good':True,
          'commit_sha':'good1234567890'
        },
        'target_verification':{'status':'passed','commit_sha':'good1234567890'},
        'schema_compatibility':{
          'status':'compatible','target_commit_sha':'good1234567890',
          'active_schema_manifest_sha256':'a'*64
        }
      }
    }

def forward_good():
    return {
      'current_release':dict(CURRENT),
      'action':{
        'strategy':'forward_fix','trigger':'irreversible_migration',
        'destructive_database_rollback':False,
        'forward_fix':{'candidate_commit_sha':'fix1234567890','migration_plan_status':'tested'},
        'migration_gate':{'status':'passed','commit_sha':'fix1234567890'},
        'isolated_schema_verification':{'status':'passed','commit_sha':'fix1234567890'}
      }
    }

def restore_good():
    return {
      'current_release':dict(CURRENT),
      'action':{
        'strategy':'isolated_restore_then_recover','trigger':'data_corruption',
        'direct_production_restore':False,
        'production_recovery_authorized':True,
        'backup':{'backup_id':'backup-001','recovery_point':'2026-09-19T00:00:00Z'},
        'isolated_restore':{
          'status':'passed',
          'integrity':{'schema':True,'relations':True,'rls':True,'binding':True}
        },
        'data_loss_boundary':{'documented':True},
        'storage_recovery':{'status':'known_gap'}
      }
    }

class RollbackEvidenceTests(unittest.TestCase):
    def test_accepts_schema_compatible_application_rollback(self):
        self.assertEqual(MOD.verify(app_good(),POLICY),'application_rollback')

    def test_rejects_application_rollback_without_schema_compatibility(self):
        e=app_good();e['action']['schema_compatibility']['status']='unknown'
        with self.assertRaisesRegex(MOD.RollbackDenied,'compatibility not proven'):
            MOD.verify(e,POLICY)

    def test_rejects_application_rollback_with_database_mutation(self):
        e=app_good();e['action']['database_mutation']=True
        with self.assertRaisesRegex(MOD.RollbackDenied,'must not mutate database'):
            MOD.verify(e,POLICY)

    def test_accepts_tested_forward_fix_for_irreversible_migration(self):
        self.assertEqual(MOD.verify(forward_good(),POLICY),'forward_fix')

    def test_rejects_forward_fix_when_c04_commit_drifts(self):
        e=forward_good();e['action']['migration_gate']['commit_sha']='wrong'
        with self.assertRaisesRegex(MOD.RollbackDenied,'migration gate commit mismatch'):
            MOD.verify(e,POLICY)

    def test_accepts_isolated_restore_recovery_readiness(self):
        self.assertEqual(MOD.verify(restore_good(),POLICY),'isolated_restore_then_recover')

    def test_rejects_direct_production_restore_or_missing_authorization(self):
        e=restore_good();e['action']['direct_production_restore']=True
        with self.assertRaisesRegex(MOD.RollbackDenied,'direct production restore forbidden'):
            MOD.verify(e,POLICY)
        e=restore_good();e['action']['production_recovery_authorized']=False
        with self.assertRaisesRegex(MOD.RollbackDenied,'authorization missing'):
            MOD.verify(e,POLICY)

    def test_rejects_wrong_canonical_project(self):
        e=app_good();e['current_release']['vercel_project_id']='wrong'
        with self.assertRaisesRegex(MOD.RollbackDenied,'current Vercel project mismatch'):
            MOD.verify(e,POLICY)

if __name__=='__main__':
    unittest.main()
