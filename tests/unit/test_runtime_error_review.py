from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
S=importlib.util.spec_from_file_location('c08',ROOT/'scripts/verify_runtime_error_review.py')
M=importlib.util.module_from_spec(S); assert S and S.loader; S.loader.exec_module(M)
P=json.loads((ROOT/'data/runtime-error-review-policy.json').read_text())
def good():
  return {'source':'vercel_runtime_logs','redaction_attested':True,
    'deployment':{'project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr','environment':'production','state':'READY','deployment_id':'dpl1','commit_sha':'abc1234'},
    'c07':{'status':'passed','commit_sha':'abc1234','deployment_id':'dpl1'},'r09':{'status':'passed'},
    'window':{'start':'2026-09-19T06:00:00Z','end':'2026-09-19T06:31:00Z'},
    'clusters':[{'fingerprint':'err-a','severity':'P2','count':2,'first_seen':'2026-09-19T06:05:00Z','last_seen':'2026-09-19T06:07:00Z','resolved':False}]}
class T(unittest.TestCase):
  def test_accepts_clean_window(self): M.verify(good(),P)
  def test_rejects_short_window(self):
    e=good();e['window']['end']='2026-09-19T06:20:00Z'
    with self.assertRaisesRegex(M.RuntimeReviewDenied,'too short'): M.verify(e,P)
  def test_rejects_unresolved_p0_p1(self):
    for sev in ['P0','P1']:
      e=good();e['clusters'][0]['severity']=sev
      with self.assertRaisesRegex(M.RuntimeReviewDenied,'unresolved '+sev): M.verify(e,P)
  def test_accepts_resolved_p1_with_resolution(self):
    e=good();e['clusters'][0].update({'severity':'P1','resolved':True,'resolution':'fixed in hotfix abc'})
    M.verify(e,P)
  def test_rejects_deployment_drift(self):
    e=good();e['c07']['deployment_id']='other'
    with self.assertRaisesRegex(M.RuntimeReviewDenied,'deployment mismatch'): M.verify(e,P)
  def test_rejects_sensitive_cluster_fields(self):
    e=good();e['clusters'][0]['authorization']='Bearer secret'
    with self.assertRaisesRegex(M.RuntimeReviewDenied,'forbidden fields'): M.verify(e,P)
if __name__=='__main__': unittest.main()
