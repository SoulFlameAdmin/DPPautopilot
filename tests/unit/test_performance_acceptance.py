from __future__ import annotations
import importlib.util,json
from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[2]
S=importlib.util.spec_from_file_location('c09',R/'scripts/verify_performance_acceptance.py');M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
P=json.loads((R/'data/performance-acceptance-policy.json').read_text())
def good():
 return {'candidate_commit_sha':'abc1234','c07':{'status':'passed','commit_sha':'abc1234'},'t07':{'status':'passed'},
 'target':{'environment':'preview','production_like':True,'uses_production_customer_data':False,'uses_production_database':False,'commit_sha':'abc1234','url':'https://preview.example.invalid','tls_verified':True},
 'network_scope':'real_http_tls','metrics':{'multi_surface':{'requests':200,'concurrency':25,'error_rate':0,'p95_ms':1500},'import_volume':{'rows':1000,'elapsed_ms':2500}}}
class T(unittest.TestCase):
 def test_accepts_budget(self): M.verify(good(),P)
 def test_rejects_synthetic_metrics(self):
  e=good();e['network_scope']='in_process'
  with self.assertRaisesRegex(M.PerformanceDenied,'cannot satisfy'): M.verify(e,P)
 def test_rejects_p95_or_error(self):
  e=good();e['metrics']['multi_surface']['p95_ms']=2001
  with self.assertRaisesRegex(M.PerformanceDenied,'p95'): M.verify(e,P)
  e=good();e['metrics']['multi_surface']['error_rate']=0.01
  with self.assertRaisesRegex(M.PerformanceDenied,'error-rate'): M.verify(e,P)
 def test_rejects_underload(self):
  e=good();e['metrics']['multi_surface']['concurrency']=24
  with self.assertRaisesRegex(M.PerformanceDenied,'concurrency'): M.verify(e,P)
 def test_rejects_import_latency(self):
  e=good();e['metrics']['import_volume']['elapsed_ms']=3001
  with self.assertRaisesRegex(M.PerformanceDenied,'import latency'): M.verify(e,P)
 def test_rejects_prod_data_or_commit_drift(self):
  e=good();e['target']['uses_production_customer_data']=True
  with self.assertRaisesRegex(M.PerformanceDenied,'customer data'): M.verify(e,P)
  e=good();e['target']['commit_sha']='wrong'
  with self.assertRaisesRegex(M.PerformanceDenied,'target commit mismatch'): M.verify(e,P)
if __name__=='__main__': unittest.main()
