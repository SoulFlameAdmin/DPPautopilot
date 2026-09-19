from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location("c14",ROOT/"scripts/generate_production_evidence_pack.py")
MOD=importlib.util.module_from_spec(SPEC); assert SPEC and SPEC.loader; SPEC.loader.exec_module(MOD)

class ProductionEvidencePackTests(unittest.TestCase):
    def setUp(self):
        self.original_plan=MOD.PLAN_PATH

    def tearDown(self):
        MOD.PLAN_PATH=self.original_plan

    def _render_with(self,statuses):
        source=json.loads((ROOT/"data/master-plan.json").read_text(encoding="utf-8"))
        for gate in source["gates"]:
            for task in gate.get("tasks",[]):
                if task["id"] in statuses:
                    task["status"]=statuses[task["id"]]
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"plan.json"
            p.write_text(json.dumps(source),encoding="utf-8")
            MOD.PLAN_PATH=p
            return MOD.build_document()

    def test_current_pack_is_fail_closed(self):
        rendered=MOD.build_document()
        self.assertIn("**Final evidence-pack decision:** **NOT READY**",rendered)
        self.assertIn("C12 legal/compliance sign-off",rendered)
        self.assertIn("C13 pilot customer UAT",rendered)

    def test_ready_requires_all_c07_c13_green(self):
        deps=["C07","C08","C09","C10","C11","C12","C13"]
        rendered=self._render_with({x:"green" for x in deps})
        self.assertIn("**Final evidence-pack decision:** **READY**",rendered)

    def test_any_non_green_dependency_denies_ready(self):
        deps=["C07","C08","C09","C10","C11","C12","C13"]
        statuses={x:"green" for x in deps}
        for failed in deps:
            case=dict(statuses);case[failed]="blocked" if failed in {"C12","C13"} else "red"
            rendered=self._render_with(case)
            self.assertIn("**Final evidence-pack decision:** **NOT READY**",rendered,failed)

    def test_pack_keeps_external_signoff_boundaries(self):
        rendered=MOD.build_document()
        self.assertIn("external qualified reviewer evidence is required",rendered)
        self.assertIn("real pilot-customer acceptance evidence is required",rendered)
        self.assertIn("does not treat repository configuration as a deployed production system",rendered)

if __name__=="__main__":
    unittest.main()
