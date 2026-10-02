#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from mapping_assistant import RULES,best_suggestion

ROOT=Path(__file__).resolve().parents[1]
cases=json.loads((ROOT/"data/mapping-assistant-eval.json").read_text(encoding="utf-8"))["cases"]
catalog=json.loads((ROOT/"data/dpp-field-catalog.json").read_text(encoding="utf-8"))

tp=tn=fp=fn=0
for case in cases:
    got=best_suggestion(case["header"])
    predicted=got["path"] if got else None
    expected=case["expected"]
    if expected is None and predicted is None:
        tn+=1
    elif expected is None and predicted is not None:
        fp+=1
    elif expected is not None and predicted==expected:
        tp+=1
    else:
        fn+=1
    if got:
        assert 0<=got["confidence"]<=1
        assert got["evidence"]["reason"] and got["evidence"]["matchedAlias"]

assert fp==0,f"BAT18 false-positive suggestions: {fp}"
assert fn==0,f"BAT18 missed/wrong curated suggestions: {fn}"
assert tp>=35,f"BAT18 expected >=35 correct positive cases, got {tp}"
assert tn>=4,f"BAT18 expected >=4 unknown columns safely unsuggested, got {tn}"

rule_paths={field["path"] for field in RULES["fields"]}
catalog_paths={field["path"] for field in catalog["fields"]}
assert rule_paths==catalog_paths,(
    f"BAT18 rules/catalog drift missing={sorted(catalog_paths-rule_paths)} "
    f"extra={sorted(rule_paths-catalog_paths)}"
)

for path in sorted(catalog_paths):
    got=best_suggestion(path)
    assert got and got["path"]==path and got["confidence"]>=0.99,(
        f"BAT18 canonical self-recognition failed for {path}: {got}"
    )

print(
    f"BAT18_MAPPING_EVAL_PASS: {len(catalog_paths)}/"
    f"{len(catalog_paths)} canonical fields recognized; "
    f"{tp} curated positives correct; {tn} unknowns untouched; 0 false positives"
)
