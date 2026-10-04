#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MATRIX=ROOT/"data/lmt-battery-71-v2.json"

def require(cond: bool, msg: str)->None:
    if not cond:
        raise AssertionError(msg)

def main()->None:
    data=json.loads(MATRIX.read_text(encoding="utf-8"))
    pts=data["points"]
    require(data["batteryCategory"]=="light_means_of_transport","matrix must target LMT")
    require(data["launchDate"]=="2027-02-18","launch date drift")
    require(len(pts)==71,"matrix must contain exactly 71 points")
    require([p["number"] for p in pts]==list(range(1,72)),"point numbers must be exactly 1..71")
    counts={}
    for p in pts:
        s=p["lmtStatusAt2027_02_18"]
        counts[s]=counts.get(s,0)+1
        require(p.get("name"),f"point {p['number']} missing name")
        require(p.get("legalSource"),f"point {p['number']} missing legal source")
        require(p.get("canonicalFieldPath"),f"point {p['number']} missing canonical mapping")
        require(p.get("access"),f"point {p['number']} missing access class")
        require(p.get("level"),f"point {p['number']} missing model/item level")
        require(p.get("valuePath"),f"point {p['number']} missing exact value path")
        require(p.get("valueType"),f"point {p['number']} missing value type")
        require(p.get("sourceOwner"),f"point {p['number']} missing provenance source owner")
        require(isinstance(p.get("effectiveAtLaunch"),bool),f"point {p['number']} missing effectiveAtLaunch flag")
        if s=="not_required_2027":
            require(p["effectiveAtLaunch"] is False,f"point {p['number']} must be launch-disabled")
        else:
            require(p["effectiveAtLaunch"] is True,f"point {p['number']} must be launch-enabled")
    expected={"mandatory":50,"if_applicable":8,"optional":1,"not_required_2027":12}
    require(counts==expected,f"LMT launch applicability drift: {counts}")
    not_required={p["number"] for p in pts if p["lmtStatusAt2027_02_18"]=="not_required_2027"}
    require(not_required==set(range(16,24))|{25,33,44,61},f"unexpected launch exclusions: {sorted(not_required)}")
    conditional={p["number"] for p in pts if p["lmtStatusAt2027_02_18"]=="if_applicable"}
    require(conditional=={35,41,57,58,68,69,70,71},f"unexpected conditional set: {sorted(conditional)}")
    require(next(p for p in pts if p["number"]==1)["canonicalFieldPath"]=="item.unique_identifier","point 1 must map to item identifier")
    require(next(p for p in pts if p["number"]==50)["access"]=="authority_only","point 50 must remain authority-only")
    for n in range(51,72):
        require(next(p for p in pts if p["number"]==n)["access"]=="legitimate_interest",f"point {n} must be legitimate-interest")
    require(data.get("validation",{}).get("schemaVersioned") is True,"versioned validation contract missing")
    require(data.get("provenance",{}).get("everyPointHasSourceOwner") is True,"provenance contract missing")
    require(data.get("versioning",{}).get("noSilentSemanticRewrite") is True,"schema versioning rule missing")
    print("LMT_71_MATRIX_PASS: 71 total / 50 mandatory / 8 conditional / 1 optional / 12 not-required-at-launch; mappings, validation, provenance and versioning present")

if __name__=="__main__":
    main()
