#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASELINE=ROOT/"data/u07-visual-baseline.json"

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    require(len(sys.argv)==2,"usage: validate_u07_visual_regression.py <candidate-report>")
    candidate_path=Path(sys.argv[1])
    require(BASELINE.is_file(),"U07 approved baseline manifest missing")
    require(candidate_path.is_file(),f"U07 candidate report missing: {candidate_path}")

    baseline=json.loads(BASELINE.read_text(encoding="utf-8"))
    candidate=json.loads(candidate_path.read_text(encoding="utf-8"))

    require(baseline.get("status")=="approved_precursor","U07 baseline is not approved")
    require(candidate.get("version")==2,"U07 candidate report version drift")
    require(candidate.get("browser")==baseline.get("browser"),"U07 browser family drift")
    require(candidate.get("browser_version")==baseline.get("browser_version"),"U07 browser version drift")
    require(candidate.get("viewport")==baseline.get("viewport"),"U07 viewport drift")
    require(candidate.get("normalization")==baseline.get("normalization"),"U07 normalization contract drift")

    bsurfaces=baseline.get("surfaces",{})
    csurfaces=candidate.get("surfaces",{})
    require(set(csurfaces)==set(bsurfaces),f"U07 surface inventory drift: {sorted(csurfaces)}")

    mismatches=[]
    for name,expected in bsurfaces.items():
        actual=csurfaces[name]
        if actual.get("route")!=expected.get("route"):
            mismatches.append(f"{name}: route")
        if actual.get("sha256")!=expected.get("sha256"):
            mismatches.append(f"{name}: sha256")

    require(not mismatches,"U07 visual regression detected: "+", ".join(mismatches))
    print(
        f"U07_VISUAL_REGRESSION_PASS: {len(bsurfaces)} approved deterministic Chromium "
        "viewport baselines matched exactly"
    )

if __name__=="__main__":
    main()
