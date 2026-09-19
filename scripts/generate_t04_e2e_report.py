#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MATRIX=ROOT/"data/t04-e2e-matrix.json"
OUT=ROOT/"artifacts/t04-e2e-report.json"

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    require(len(sys.argv)==2,"usage: generate_t04_e2e_report.py <onboarding-dom>")
    dom_path=Path(sys.argv[1])
    require(MATRIX.is_file(),"T04 matrix missing")
    require(dom_path.is_file(),f"T04 onboarding DOM missing: {dom_path}")

    matrix=json.loads(MATRIX.read_text(encoding="utf-8"))
    dom=dom_path.read_text(encoding="utf-8",errors="replace")

    browser=matrix["evidence_layers"]["browser_synthetic"]
    for marker in browser["required_markers"]:
        require(marker in dom,f"T04 browser evidence missing: {marker}")

    api_path=ROOT/matrix["evidence_layers"]["stateful_api_handler"]["file"]
    api_text=api_path.read_text(encoding="utf-8")
    require(matrix["evidence_layers"]["stateful_api_handler"]["required_marker"] in api_text,
            "T04 stateful API marker missing")

    db_path=ROOT/matrix["evidence_layers"]["local_db_replay"]["file"]
    db_text=db_path.read_text(encoding="utf-8")
    require(matrix["evidence_layers"]["local_db_replay"]["required_marker"] in db_text,
            "T04 DB onboarding marker missing")

    final=matrix["final_acceptance"]
    require(final["deployed_browser_to_db"] is False,
            "T04 precursor must not claim deployed browser-to-DB acceptance")
    require(final["real_auth_session"] is False,
            "T04 precursor must not claim real auth session acceptance")
    require(final["real_storage_object_roundtrip"] is False,
            "T04 precursor must not claim storage object acceptance")
    require(final["production_route"] is False,
            "T04 precursor must not claim production route acceptance")

    report={
      "version":1,
      "task":"T04",
      "precursor_pass":True,
      "critical_journey":matrix["critical_journey"],
      "layers":{
        "browser_synthetic":{"status":"pass","dom":str(dom_path)},
        "stateful_api_handler":{"status":"pass","source":str(api_path.relative_to(ROOT))},
        "local_db_replay":{"status":"pass","source":str(db_path.relative_to(ROOT))},
        "bound_supabase":{
          "status":"previously_observed_pass",
          "marker":matrix["evidence_layers"]["bound_supabase"]["observed_marker"],
          "project_id":matrix["evidence_layers"]["bound_supabase"]["project_id"]
        }
      },
      "final_acceptance":{
        **final,
        "pass":False
      },
      "statement":"T04 precursor passes layered synthetic/stateful/local-DB evidence only; deployed browser-to-DB acceptance remains unproven."
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(
      "T04_E2E_PRECURSOR_PASS: browser synthetic + stateful API + local DB onboarding layers "
      "are aligned; deployed browser-to-DB/auth/storage acceptance remains explicitly false"
    )

if __name__=="__main__":
    main()
