#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
POLICY=ROOT/"data/t09-accessibility-gate.json"
OUT=ROOT/"artifacts/t09-accessibility-report.json"

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def attr(dom: str, name: str) -> str | None:
    match=re.search(rf'{re.escape(name)}="([^"]*)"',dom)
    return match.group(1) if match else None

def main() -> None:
    require(len(sys.argv)==2,"usage: generate_t09_accessibility_report.py <artifact-dir>")
    artifacts=Path(sys.argv[1])
    policy=json.loads(POLICY.read_text(encoding="utf-8"))
    rows={}

    for surface in policy["surfaces"]:
        path=artifacts/f"u05-{surface}.html"
        require(path.is_file(),f"T09 missing U05 DOM evidence: {path.name}")
        dom=path.read_text(encoding="utf-8",errors="replace")
        require(attr(dom,"data-accessibility-probe")=="true",f"T09 {surface} probe missing")
        require(attr(dom,"data-accessibility-ready")=="true",f"T09 {surface} probe not ready")
        require(attr(dom,"data-a11y-pass")=="true",f"T09 {surface} accessibility failed")
        main_count=attr(dom,"data-a11y-main-count")
        h1_count=attr(dom,"data-a11y-h1-count")
        interactive=attr(dom,"data-a11y-interactive-count")
        require(main_count is not None and int(main_count)>=1,f"T09 {surface} main landmark missing")
        require(h1_count=="1",f"T09 {surface} H1 count drift: {h1_count}")
        require(interactive is not None and interactive.isdigit(),f"T09 {surface} interactive count missing")

        counters={}
        for suffix in policy["required"]["zero_counters"]:
            marker="data-a11y-"+suffix
            value=attr(dom,marker)
            require(value=="0",f"T09 {surface} non-zero {marker}: {value}")
            counters[suffix]=0

        rows[surface]={
          "status":"pass",
          "main_count":int(main_count),
          "h1_count":int(h1_count),
          "interactive_count":int(interactive),
          "critical_counters":counters
        }

    report={
      "version":1,
      "task":"T09",
      "precursor_pass":True,
      "surface_count":len(rows),
      "surfaces":rows,
      "final_acceptance":{
        "u05_green":False,
        "deployed_manual_accessibility":False,
        "pass":False
      },
      "statement":"Automated accessibility regressions block CI across 10 core surfaces; final T09 acceptance remains dependency-blocked by U05/manual deployed evidence."
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"T09_ACCESSIBILITY_GATE_PASS: {len(rows)} core surfaces have zero critical automated accessibility regressions")

if __name__=="__main__":
    main()
