#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from mapping_assistant import best_suggestion

ROOT=Path(__file__).resolve().parents[1]
cases=json.loads((ROOT/"data/mapping-assistant-eval.json").read_text(encoding="utf-8"))["cases"]

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

assert fp==0,f"X06 false-positive suggestions: {fp}"
assert fn==0,f"X06 missed/wrong suggestions: {fn}"
assert tp>=10,f"X06 expected >=10 correct positive cases, got {tp}"
assert tn>=2,f"X06 expected unknown columns to remain unsuggested, got tn={tn}"
print(f"X06_MAPPING_EVAL_PASS: {tp} positive cases correct, {tn} unknown columns safely unsuggested, 0 false positives, 0 misses")
