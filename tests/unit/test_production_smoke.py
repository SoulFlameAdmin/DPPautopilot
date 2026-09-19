from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('prodsmoke',ROOT/'scripts/verify_production_smoke.py')
MOD=importlib.util.module_from_spec(SPEC); assert SPEC and SPEC.loader; SPEC.loader.exec_module(MOD)
POLICY=json.loads((ROOT/'data/production-smoke-policy.json').read_text(encoding='utf-8'))
HEADERS={
 'Content-Security-Policy':"default-src 'self'",
 'Strict-Transport-Security':'max-age=31536000',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=()'
}

def good():
    sha='abc1234567890'
    ident='urn:dpp:smoke:public:001'
    return {
      'candidate_commit_sha':sha,
      'observed_at':'2026-09-19T06:40:00Z',
      'deployment':{
        'team_id':'team_cKaIZfnCMzoiiq80J0MhV0A2',
        'project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr',
        'environment':'production','state':'READY','commit_sha':sha,
        'deployment_id':'dpl_prod_001','url':'https://prod.example.invalid',
        'tls_verified':True,'ready_at':'2026-09-19T06:39:00Z'
      },
      'release_gates':{
        'C03':{'status':'passed','commit_sha':sha},
        'C06':{'status':'passed','commit_sha':sha}
      },
      'checks':{
        'home':{'route':'/','status':200,'body_marker':'DPP Autopilot','headers':dict(HEADERS)},
        'auth_ui':{'route':'/demo/auth.html','status':200,'headers':dict(HEADERS)},
        'core_api_auth_boundary':{
          'route':'/api/models','status':401,'error_code':'AUTH_REQUIRED',
          'headers':dict(HEADERS,**{'X-Request-ID':'req-prod-1'})
        },
        'public_passport':{
          'route':'/api/passport?identifier='+ident,'status':200,'identifier':ident,
          'payload':{'identifier':ident,'status':'active','public_payload':{'chemistry':'LFP'}},
          'headers':dict(HEADERS)
        }
      }
    }

class ProductionSmokeTests(unittest.TestCase):
    def test_accepts_complete_timestamped_smoke_evidence(self):
        MOD.verify(good(),POLICY)

    def test_rejects_wrong_project_or_non_ready(self):
        e=good();e['deployment']['project_id']='wrong'
        with self.assertRaisesRegex(MOD.ProductionSmokeDenied,'project mismatch'): MOD.verify(e,POLICY)
        e=good();e['deployment']['state']='BUILDING'
        with self.assertRaisesRegex(MOD.ProductionSmokeDenied,'not READY'): MOD.verify(e,POLICY)

    def test_rejects_smoke_before_ready_or_tls_failure(self):
        e=good();e['observed_at']='2026-09-19T06:38:00Z'
        with self.assertRaisesRegex(MOD.ProductionSmokeDenied,'predates'): MOD.verify(e,POLICY)
        e=good();e['deployment']['tls_verified']=False
        with self.assertRaisesRegex(MOD.ProductionSmokeDenied,'TLS not verified'): MOD.verify(e,POLICY)

    def test_rejects_release_gate_commit_drift(self):
        e=good();e['release_gates']['C06']['commit_sha']='wrong'
        with self.assertRaisesRegex(MOD.ProductionSmokeDenied,'C06 commit mismatch'): MOD.verify(e,POLICY)

    def test_rejects_missing_security_header_or_auth_boundary(self):
        e=good();del e['checks']['home']['headers']['Strict-Transport-Security']
        with self.assertRaisesRegex(MOD.ProductionSmokeDenied,'security headers missing'): MOD.verify(e,POLICY)
        e=good();e['checks']['core_api_auth_boundary']['status']=200
        with self.assertRaisesRegex(MOD.ProductionSmokeDenied,'must reject anonymous'): MOD.verify(e,POLICY)

    def test_rejects_private_public_passport_leak(self):
        e=good();e['checks']['public_passport']['payload']['private_payload']={'secret':'x'}
        with self.assertRaisesRegex(MOD.ProductionSmokeDenied,'leaked forbidden keys'): MOD.verify(e,POLICY)

if __name__=='__main__':
    unittest.main()
